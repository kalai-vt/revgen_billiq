from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.plans import get_plan
from app.models.settings import Settings
from app.models.subscription_event import SubscriptionEvent
from app.models.tenant import Tenant

SUBSCRIPTION_STATUSES = ("trialing", "active", "past_due", "cancelled")


class AdminSubscriptionError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _price_for(plan_id: str) -> int:
    return get_plan(plan_id)["price_inr"]


def list_subscriptions(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(Tenant, Settings)
        .join(Settings, Settings.tenant_id == Tenant.id)
        .filter(Tenant.is_deleted.is_(False))
        .order_by(Tenant.created_at.desc())
        .all()
    )
    return [
        {
            "tenant_id": tenant.id,
            "company_name": tenant.company_name,
            "plan": settings_row.plan,
            "price_inr": _price_for(settings_row.plan),
            "subscription_status": settings_row.subscription_status,
            "trial_ends_at": settings_row.trial_ends_at,
            "created_at": tenant.created_at,
        }
        for tenant, settings_row in rows
    ]


def get_subscription(db: Session, tenant_id: str) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSubscriptionError(404, "Customer not found")
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise AdminSubscriptionError(404, "Settings not found for this customer")

    history = (
        db.query(SubscriptionEvent)
        .filter(SubscriptionEvent.tenant_id == tenant_id)
        .order_by(SubscriptionEvent.created_at.desc())
        .all()
    )
    return {
        "tenant_id": tenant.id,
        "company_name": tenant.company_name,
        "plan": settings_row.plan,
        "price_inr": _price_for(settings_row.plan),
        "subscription_status": settings_row.subscription_status,
        "trial_ends_at": settings_row.trial_ends_at,
        "history": history,
    }


def update_subscription(
    db: Session,
    tenant_id: str,
    *,
    changed_by: str,
    plan: str | None,
    subscription_status: str | None,
    trial_ends_at,
    clear_trial: bool,
    note: str | None,
) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSubscriptionError(404, "Customer not found")
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise AdminSubscriptionError(404, "Settings not found for this customer")

    if plan is not None and plan not in ("basic", "explore", "advance"):
        raise AdminSubscriptionError(400, "Invalid plan")
    if subscription_status is not None and subscription_status not in SUBSCRIPTION_STATUSES:
        raise AdminSubscriptionError(400, f"Invalid status. Must be one of: {', '.join(SUBSCRIPTION_STATUSES)}")

    from_plan, from_status = settings_row.plan, settings_row.subscription_status
    event_type = "updated"

    if plan is not None and plan != settings_row.plan:
        event_type = "upgrade" if _price_for(plan) > _price_for(settings_row.plan) else "downgrade"
        settings_row.plan = plan
    if subscription_status is not None and subscription_status != settings_row.subscription_status:
        if subscription_status == "cancelled":
            event_type = "cancelled"
        elif settings_row.subscription_status == "cancelled" and subscription_status == "active":
            event_type = "reactivated"
        settings_row.subscription_status = subscription_status
    if clear_trial:
        settings_row.trial_ends_at = None
    elif trial_ends_at is not None:
        settings_row.trial_ends_at = trial_ends_at

    db.add(settings_row)
    db.add(
        SubscriptionEvent(
            tenant_id=tenant_id,
            event_type=event_type,
            from_plan=from_plan,
            to_plan=settings_row.plan,
            from_status=from_status,
            to_status=settings_row.subscription_status,
            note=note,
            changed_by=changed_by,
        )
    )
    db.commit()
    return get_subscription(db, tenant_id)
