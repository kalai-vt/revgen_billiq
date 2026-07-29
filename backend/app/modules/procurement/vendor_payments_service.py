from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.activity import ACTION_PAYMENT_RECEIVED, MODULE_VENDOR_PAYMENT, log_activity
from app.models.procurement import PurchaseEntry, PurchaseReturn, Vendor, VendorPayment, VendorPaymentAllocation
from app.models.user import User
from app.schemas.vendor_payments import (
    OutstandingPurchaseOut,
    VendorLedgerEntryOut,
    VendorLedgerOut,
    VendorPaymentCreate,
    VendorPaymentOut,
)


class VendorPaymentError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _next_payment_number(db: Session, tenant_id: str) -> str:
    count = db.query(func.count(VendorPayment.id)).filter(VendorPayment.tenant_id == tenant_id).scalar() or 0
    year = datetime.now(timezone.utc).year
    return f"VP-{year}-{count + 1:06d}"


def _user_name(db: Session, user_id: str | None) -> str:
    if not user_id:
        return ""
    user = db.get(User, user_id)
    return f"{user.first_name} {user.last_name}" if user else ""


def to_payment_out(db: Session, payment: VendorPayment) -> VendorPaymentOut:
    vendor = db.get(Vendor, payment.vendor_id)
    allocations = []
    for alloc in payment.allocations:
        purchase = db.get(PurchaseEntry, alloc.purchase_entry_id)
        allocations.append(
            {
                "id": alloc.id,
                "purchase_entry_id": alloc.purchase_entry_id,
                "purchase_number": purchase.purchase_number if purchase else "",
                "amount": alloc.amount,
            }
        )
    return VendorPaymentOut(
        id=payment.id,
        tenant_id=payment.tenant_id,
        vendor_id=payment.vendor_id,
        vendor_name=vendor.name if vendor else "",
        payment_number=payment.payment_number,
        amount=payment.amount,
        payment_method=payment.payment_method,
        reference_number=payment.reference_number,
        notes=payment.notes,
        paid_by=payment.paid_by,
        paid_by_name=_user_name(db, payment.paid_by),
        created_at=payment.created_at,
        allocations=allocations,
    )


def list_outstanding_purchases(db: Session, tenant_id: str, vendor_id: str) -> list[OutstandingPurchaseOut]:
    purchases = (
        db.query(PurchaseEntry)
        .filter(
            PurchaseEntry.tenant_id == tenant_id,
            PurchaseEntry.vendor_id == vendor_id,
            PurchaseEntry.status == "received",
            PurchaseEntry.outstanding_amount > 0,
        )
        .order_by(PurchaseEntry.due_date.asc().nulls_last(), PurchaseEntry.created_at.asc())
        .all()
    )
    return [OutstandingPurchaseOut.model_validate(p) for p in purchases]


def create_vendor_payment(db: Session, tenant_id: str, current_user: User, payload: VendorPaymentCreate) -> VendorPayment:
    vendor = db.query(Vendor).filter(Vendor.tenant_id == tenant_id, Vendor.id == payload.vendor_id).first()
    if not vendor:
        raise VendorPaymentError(404, "Vendor not found")

    alloc_pairs: list[tuple[PurchaseEntry, float]] = []

    if payload.allocations:
        total_alloc = round(sum(a.amount for a in payload.allocations), 2)
        if total_alloc != round(payload.amount, 2):
            raise VendorPaymentError(400, "Allocated amounts must add up to the payment amount")
        for allocation in payload.allocations:
            purchase = (
                db.query(PurchaseEntry)
                .filter(
                    PurchaseEntry.tenant_id == tenant_id,
                    PurchaseEntry.id == allocation.purchase_entry_id,
                    PurchaseEntry.vendor_id == payload.vendor_id,
                )
                .first()
            )
            if not purchase:
                raise VendorPaymentError(404, f"Purchase {allocation.purchase_entry_id} not found for this vendor")
            if allocation.amount > purchase.outstanding_amount + 0.01:
                raise VendorPaymentError(
                    400,
                    f"Cannot allocate more than the outstanding {purchase.outstanding_amount:.2f} on purchase {purchase.purchase_number}",
                )
            alloc_pairs.append((purchase, round(allocation.amount, 2)))
    else:
        outstanding = (
            db.query(PurchaseEntry)
            .filter(
                PurchaseEntry.tenant_id == tenant_id,
                PurchaseEntry.vendor_id == payload.vendor_id,
                PurchaseEntry.status == "received",
                PurchaseEntry.outstanding_amount > 0,
            )
            .order_by(PurchaseEntry.due_date.asc().nulls_last(), PurchaseEntry.created_at.asc())
            .all()
        )
        remaining = round(payload.amount, 2)
        for purchase in outstanding:
            if remaining <= 0:
                break
            apply_amount = round(min(remaining, purchase.outstanding_amount), 2)
            if apply_amount <= 0:
                continue
            alloc_pairs.append((purchase, apply_amount))
            remaining -= apply_amount

        if not alloc_pairs:
            raise VendorPaymentError(400, f"'{vendor.name}' has no outstanding purchases to apply this payment to")
        if remaining > 0.01:
            raise VendorPaymentError(400, f"Amount exceeds '{vendor.name}'s total outstanding by {remaining:.2f}")

    payment = VendorPayment(
        tenant_id=tenant_id,
        vendor_id=payload.vendor_id,
        payment_number=_next_payment_number(db, tenant_id),
        amount=payload.amount,
        payment_method=payload.payment_method,
        reference_number=payload.reference_number,
        notes=payload.notes,
        paid_by=current_user.id,
    )
    db.add(payment)
    db.flush()

    for purchase, amount in alloc_pairs:
        db.add(VendorPaymentAllocation(vendor_payment_id=payment.id, purchase_entry_id=purchase.id, amount=amount))
        purchase.paid_amount = round(purchase.paid_amount + amount, 2)
        purchase.outstanding_amount = round(purchase.outstanding_amount - amount, 2)
        if purchase.outstanding_amount <= 0.01:
            purchase.outstanding_amount = 0.0
            purchase.payment_status = "paid"
        else:
            purchase.payment_status = "partial"
        db.add(purchase)

    vendor.outstanding_amount = round(max(0.0, vendor.outstanding_amount - payload.amount), 2)
    db.add(vendor)

    log_activity(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        module=MODULE_VENDOR_PAYMENT,
        action=ACTION_PAYMENT_RECEIVED,
        description=f"Paid {payment.payment_number} ({payload.amount:.2f}) to '{vendor.name}'",
        entity_type="VendorPayment",
        entity_id=payment.id,
    )
    db.commit()
    db.refresh(payment)
    return payment


def list_vendor_payments(
    db: Session, tenant_id: str, vendor_id: str | None = None, page: int = 1, page_size: int = 20
) -> tuple[list[VendorPaymentOut], int]:
    query = db.query(VendorPayment).filter(VendorPayment.tenant_id == tenant_id)
    if vendor_id:
        query = query.filter(VendorPayment.vendor_id == vendor_id)
    total = query.count()
    rows = query.order_by(VendorPayment.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return [to_payment_out(db, p) for p in rows], total


def get_vendor_ledger(db: Session, tenant_id: str, vendor_id: str) -> VendorLedgerOut:
    vendor = db.query(Vendor).filter(Vendor.tenant_id == tenant_id, Vendor.id == vendor_id).first()
    if not vendor:
        raise VendorPaymentError(404, "Vendor not found")

    raw_entries: list[dict] = []

    purchases = (
        db.query(PurchaseEntry)
        .filter(PurchaseEntry.tenant_id == tenant_id, PurchaseEntry.vendor_id == vendor_id, PurchaseEntry.status == "received")
        .all()
    )
    for p in purchases:
        raw_entries.append(
            {
                "date": p.created_at,
                "type": "purchase",
                "reference": p.purchase_number,
                "description": f"Purchase {p.purchase_number}",
                "debit": p.total_amount,
                "credit": 0.0,
            }
        )

    payments = db.query(VendorPayment).filter(VendorPayment.tenant_id == tenant_id, VendorPayment.vendor_id == vendor_id).all()
    for pay in payments:
        raw_entries.append(
            {
                "date": pay.created_at,
                "type": "payment",
                "reference": pay.payment_number,
                "description": f"Payment made ({pay.payment_method})",
                "debit": 0.0,
                "credit": pay.amount,
            }
        )

    returns = (
        db.query(PurchaseReturn)
        .filter(PurchaseReturn.tenant_id == tenant_id, PurchaseReturn.vendor_id == vendor_id, PurchaseReturn.status != "cancelled")
        .all()
    )
    for r in returns:
        raw_entries.append(
            {
                "date": r.created_at,
                "type": "return",
                "reference": r.return_number,
                "description": "Purchase return",
                "debit": 0.0,
                "credit": r.refund_amount,
            }
        )

    raw_entries.sort(key=lambda e: e["date"])
    balance = 0.0
    entries: list[VendorLedgerEntryOut] = []
    for e in raw_entries:
        balance = round(balance + e["debit"] - e["credit"], 2)
        entries.append(VendorLedgerEntryOut(balance=balance, **e))

    return VendorLedgerOut(vendor_id=vendor.id, vendor_name=vendor.name, opening_balance=0.0, closing_balance=balance, entries=entries)
