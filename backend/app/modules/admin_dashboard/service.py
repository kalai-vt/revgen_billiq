from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.sales import Invoice
from app.models.tenant import Tenant
from app.models.user import User


def _today_start_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def get_dashboard_summary(db: Session) -> dict[str, Any]:
    total_tenants = db.query(func.count(Tenant.id)).filter(Tenant.is_deleted.is_(False)).scalar() or 0
    active_tenants = (
        db.query(func.count(Tenant.id)).filter(Tenant.is_deleted.is_(False), Tenant.status == "active").scalar() or 0
    )
    suspended_tenants = (
        db.query(func.count(Tenant.id)).filter(Tenant.is_deleted.is_(False), Tenant.status == "suspended").scalar() or 0
    )

    today_start = _today_start_utc()
    today_signups = (
        db.query(func.count(Tenant.id))
        .filter(Tenant.is_deleted.is_(False), Tenant.created_at >= today_start)
        .scalar()
        or 0
    )

    total_users = db.query(func.count(User.id)).scalar() or 0
    total_invoices = db.query(func.count(Invoice.id)).scalar() or 0
    total_transactions = (
        db.query(func.count(Invoice.id)).filter(Invoice.payment_status != "cancelled").scalar() or 0
    )

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    monthly_revenue = (
        db.query(func.coalesce(func.sum(Invoice.total_amount), 0.0))
        .filter(Invoice.created_at >= month_start)
        .scalar()
        or 0.0
    )
    annual_revenue = (
        db.query(func.coalesce(func.sum(Invoice.total_amount), 0.0))
        .filter(Invoice.created_at >= year_start)
        .scalar()
        or 0.0
    )
    outstanding_payments = db.query(func.coalesce(func.sum(Invoice.outstanding_amount), 0.0)).scalar() or 0.0

    revenue_trend = []
    for i in range(5, -1, -1):
        bucket_start = (month_start - timedelta(days=30 * i)).replace(day=1)
        if i == 0:
            bucket_end = now
        else:
            next_month = (bucket_start.replace(day=28) + timedelta(days=4)).replace(day=1)
            bucket_end = next_month
        amount = (
            db.query(func.coalesce(func.sum(Invoice.total_amount), 0.0))
            .filter(Invoice.created_at >= bucket_start, Invoice.created_at < bucket_end)
            .scalar()
            or 0.0
        )
        revenue_trend.append({"month": bucket_start.strftime("%b %Y"), "revenue": round(amount, 2)})

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "suspended_tenants": suspended_tenants,
        "today_signups": today_signups,
        "total_users": total_users,
        "total_invoices": total_invoices,
        "total_transactions": total_transactions,
        "monthly_revenue": round(monthly_revenue, 2),
        "annual_revenue": round(annual_revenue, 2),
        "outstanding_payments": round(outstanding_payments, 2),
        "revenue_trend": revenue_trend,
    }
