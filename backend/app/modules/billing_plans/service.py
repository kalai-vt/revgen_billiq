from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.limits import get_effective_limits
from app.core.plans import get_plan
from app.models.catalog import Product
from app.models.customer import Customer
from app.models.sales import Invoice
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.models.user import User


def _month_start_utc(tenant: Tenant) -> datetime:
    try:
        tz = ZoneInfo(tenant.timezone)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    local_now = datetime.now(tz)
    local_month_start = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return local_month_start.astimezone(timezone.utc)


def _month_end_utc(month_start: datetime) -> datetime:
    # Approximate next-month boundary by stepping 32 days past month start then clamping to day 1
    # — cheaper than a calendar library and this is only used for a display range, not billing math.
    next_month = (month_start + timedelta(days=32)).replace(day=1)
    return next_month


def get_usage(db: Session, tenant: Tenant) -> dict[str, Any]:
    tenant_id = tenant.id
    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    plan_id = settings.plan if settings else "basic"
    subscription_status = settings.subscription_status if settings else "active"
    trial_ends_at = settings.trial_ends_at if settings else None
    plan = get_plan(plan_id)
    limits = get_effective_limits(db, tenant_id)

    user_count = db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar() or 0
    product_count = db.query(func.count(Product.id)).filter(Product.tenant_id == tenant_id).scalar() or 0
    customer_count = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0
    month_start = _month_start_utc(tenant)
    month_end = _month_end_utc(month_start)
    monthly_invoice_count = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.tenant_id == tenant_id, Invoice.created_at >= month_start)
        .scalar()
        or 0
    )

    return {
        "plan": plan_id,
        "label": plan["label"],
        "price_inr": plan["price_inr"],
        "features": plan["features"],
        "subscription_status": subscription_status,
        "trial_ends_at": trial_ends_at,
        "billing_cycle": {"start": month_start, "end": month_end},
        "usage": {
            "users": {"used": user_count, "limit": limits["max_users"]},
            "products": {"used": product_count, "limit": limits["max_products"]},
            "customers": {"used": customer_count, "limit": limits["max_customers"]},
            "monthly_invoices": {"used": monthly_invoice_count, "limit": limits["max_monthly_invoices"]},
            # No Branch/Warehouse model exists yet — the app is single-location today, so usage is
            # fixed at 1 while the limit itself stays admin-configurable ahead of that capability.
            "branches": {"used": 1, "limit": limits["max_branches"]},
            "warehouses": {"used": 1, "limit": limits["max_warehouses"]},
            # Storage usage isn't tracked anywhere yet (no file-size capture at upload time) —
            # `used: None` signals "not tracked" to the frontend rather than a fabricated number.
            "storage": {"used": None, "limit": limits["max_storage_mb"]},
        },
    }
