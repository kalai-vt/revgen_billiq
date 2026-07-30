from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.payments import razorpay_client
from app.core.plans import get_plan
from app.models.settings import Settings
from app.models.subscription_event import SubscriptionEvent
from app.models.subscription_payment import SubscriptionPayment
from app.models.tenant import Tenant


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BillingError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _get_settings(db: Session, tenant_id: str) -> Settings:
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise BillingError(404, "Settings not found for this tenant")
    return settings_row


def create_checkout_order(db: Session, tenant: Tenant) -> dict[str, Any]:
    """Creates a Razorpay order to pay for the tenant's *current, admin-assigned* plan. Deliberately
    reads the price from `Settings.plan` rather than accepting a plan from the request — a tenant
    can pay to (re)activate the plan their Super Admin already set, never choose a different one.
    """
    if not razorpay_client.is_configured():
        raise BillingError(503, "Online payment isn't set up yet. Contact your administrator to change your plan.")

    settings_row = _get_settings(db, tenant.id)
    plan = get_plan(settings_row.plan)
    amount_paise = plan["price_inr"] * 100

    payment = SubscriptionPayment(
        tenant_id=tenant.id,
        plan=settings_row.plan,
        amount_inr=plan["price_inr"],
        status="created",
        razorpay_order_id="pending",
    )
    db.add(payment)
    db.flush()

    order = razorpay_client.create_order(
        amount_paise=amount_paise, receipt=payment.id, notes={"tenant_id": tenant.id, "plan": settings_row.plan}
    )
    payment.razorpay_order_id = order["id"]
    db.add(payment)
    db.commit()

    return {
        "order_id": order["id"],
        "amount_inr": plan["price_inr"],
        "currency": "INR",
        "razorpay_key_id": app_settings.razorpay_key_id,
        "plan": settings_row.plan,
        "plan_label": plan["label"],
    }


def _activate_from_payment(db: Session, payment: SubscriptionPayment, *, razorpay_payment_id: str) -> None:
    payment.status = "paid"
    payment.razorpay_payment_id = razorpay_payment_id
    payment.paid_at = _now()
    db.add(payment)

    settings_row = db.query(Settings).filter(Settings.tenant_id == payment.tenant_id).first()
    if settings_row and settings_row.subscription_status != "active":
        from_status = settings_row.subscription_status
        settings_row.subscription_status = "active"
        settings_row.trial_ends_at = None
        db.add(settings_row)
        db.add(
            SubscriptionEvent(
                tenant_id=payment.tenant_id,
                event_type="payment_received",
                from_plan=payment.plan,
                to_plan=payment.plan,
                from_status=from_status,
                to_status="active",
                note=f"Razorpay payment {razorpay_payment_id}",
                changed_by="tenant (self-service payment)",
            )
        )


def verify_and_activate(db: Session, tenant_id: str, *, order_id: str, payment_id: str, signature: str) -> dict[str, Any]:
    """Primary confirmation path — called immediately by the frontend after Razorpay Checkout.js
    reports success. The webhook (below) is the durability fallback for cases where the browser
    closes before this call fires."""
    if not razorpay_client.verify_payment_signature(order_id=order_id, payment_id=payment_id, signature=signature):
        raise BillingError(400, "Payment verification failed — this payment was not confirmed.")

    payment = (
        db.query(SubscriptionPayment)
        .filter(SubscriptionPayment.tenant_id == tenant_id, SubscriptionPayment.razorpay_order_id == order_id)
        .first()
    )
    if not payment:
        raise BillingError(404, "No matching payment record found for this order")
    if payment.status == "paid":
        return {"status": "already_paid"}

    _activate_from_payment(db, payment, razorpay_payment_id=payment_id)
    db.commit()
    return {"status": "paid"}


def handle_webhook(db: Session, *, body: bytes, signature: str) -> None:
    if not razorpay_client.verify_webhook_signature(body=body, signature=signature):
        raise BillingError(400, "Invalid webhook signature")

    payload = json.loads(body)
    event = payload.get("event")

    if event == "payment.captured":
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = entity.get("order_id")
        payment_id = entity.get("id")
        payment = db.query(SubscriptionPayment).filter(SubscriptionPayment.razorpay_order_id == order_id).first()
        if payment and payment.status != "paid":
            _activate_from_payment(db, payment, razorpay_payment_id=payment_id)
            db.commit()
    elif event == "payment.failed":
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = entity.get("order_id")
        payment = db.query(SubscriptionPayment).filter(SubscriptionPayment.razorpay_order_id == order_id).first()
        if payment and payment.status == "created":
            payment.status = "failed"
            payment.failure_reason = entity.get("error_description")
            db.add(payment)
            db.commit()


def list_payments(db: Session, tenant_id: str) -> list[SubscriptionPayment]:
    return (
        db.query(SubscriptionPayment)
        .filter(SubscriptionPayment.tenant_id == tenant_id)
        .order_by(SubscriptionPayment.created_at.desc())
        .all()
    )
