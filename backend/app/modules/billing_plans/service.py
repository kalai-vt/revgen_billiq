from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlalchemy.orm import Session

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


def get_usage(db: Session, tenant: Tenant) -> dict[str, Any]:
    tenant_id = tenant.id
    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    plan_id = settings.plan if settings else "basic"
    plan = get_plan(plan_id)

    user_count = db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar() or 0
    product_count = db.query(func.count(Product.id)).filter(Product.tenant_id == tenant_id).scalar() or 0
    customer_count = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0
    month_start = _month_start_utc(tenant)
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
        "usage": {
            "users": {"used": user_count, "limit": plan["max_users"]},
            "products": {"used": product_count, "limit": plan["max_products"]},
            "customers": {"used": customer_count, "limit": plan["max_customers"]},
            "monthly_invoices": {"used": monthly_invoice_count, "limit": plan["max_monthly_invoices"]},
        },
    }
