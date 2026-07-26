from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.payment import Payment
from app.models.sales import Invoice
from app.models.tenant import Tenant


def list_payments(
    db: Session,
    *,
    tenant_id: str | None = None,
    payment_method: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    query = (
        db.query(Payment, Tenant.company_name, Customer.name)
        .join(Tenant, Tenant.id == Payment.tenant_id)
        .outerjoin(Customer, Customer.id == Payment.customer_id)
    )
    if tenant_id:
        query = query.filter(Payment.tenant_id == tenant_id)
    if payment_method:
        query = query.filter(Payment.payment_method == payment_method)
    if date_from:
        query = query.filter(Payment.created_at >= date_from)
    if date_to:
        query = query.filter(Payment.created_at <= date_to)

    total = query.with_entities(func.count(Payment.id)).scalar() or 0
    rows = query.order_by(Payment.created_at.desc()).offset(offset).limit(limit).all()
    items = [
        {
            "id": payment.id,
            "tenant_id": payment.tenant_id,
            "company_name": company_name,
            "customer_name": customer_name,
            "payment_number": payment.payment_number,
            "amount": payment.amount,
            "payment_method": payment.payment_method,
            "reference_number": payment.reference_number,
            "created_at": payment.created_at,
        }
        for payment, company_name, customer_name in rows
    ]
    return {"items": items, "total": total}


def get_payments_summary(db: Session) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    collected_this_month = (
        db.query(func.coalesce(func.sum(Payment.amount), 0.0)).filter(Payment.created_at >= month_start).scalar() or 0.0
    )
    collected_all_time = db.query(func.coalesce(func.sum(Payment.amount), 0.0)).scalar() or 0.0

    by_method_rows = db.query(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0.0)).group_by(
        Payment.payment_method
    ).all()
    by_method = {method: round(total, 2) for method, total in by_method_rows}

    outstanding_total = db.query(func.coalesce(func.sum(Invoice.outstanding_amount), 0.0)).scalar() or 0.0
    tenants_with_outstanding = (
        db.query(func.count(func.distinct(Invoice.tenant_id))).filter(Invoice.outstanding_amount > 0).scalar() or 0
    )

    return {
        "collected_this_month": round(collected_this_month, 2),
        "collected_all_time": round(collected_all_time, 2),
        "by_method": by_method,
        "outstanding_total": round(outstanding_total, 2),
        "tenants_with_outstanding": tenants_with_outstanding,
    }
