from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.sales import Invoice
from app.models.customer import Customer
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.models.user import User
from app.modules.auth.service import request_password_reset


class AdminCustomerError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _get_owner(db: Session, tenant_id: str) -> User | None:
    return (
        db.query(User)
        .filter(User.tenant_id == tenant_id, User.role == "owner")
        .order_by(User.created_at.asc())
        .first()
    )


def _get_plan(db: Session, tenant_id: str) -> str:
    row = db.query(Settings.plan).filter(Settings.tenant_id == tenant_id).first()
    return row[0] if row else "basic"


def list_customers(db: Session, search: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    query = db.query(Tenant).filter(Tenant.is_deleted.is_(False))
    if status:
        query = query.filter(Tenant.status == status)
    if search:
        like = f"%{search}%"
        query = query.filter((Tenant.company_name.ilike(like)) | (Tenant.email.ilike(like)))

    tenants = query.order_by(Tenant.created_at.desc()).all()
    results: list[dict[str, Any]] = []
    for tenant in tenants:
        owner = _get_owner(db, tenant.id)
        total_invoices = db.query(func.count(Invoice.id)).filter(Invoice.tenant_id == tenant.id).scalar() or 0
        total_users = db.query(func.count(User.id)).filter(User.tenant_id == tenant.id).scalar() or 0
        results.append(
            {
                "tenant_id": tenant.id,
                "company_name": tenant.company_name,
                "owner_name": f"{owner.first_name} {owner.last_name}" if owner else None,
                "owner_email": owner.email if owner else tenant.email,
                "plan": _get_plan(db, tenant.id),
                "status": tenant.status,
                "total_invoices": total_invoices,
                "total_users": total_users,
                "last_login": owner.last_login if owner else None,
                "created_at": tenant.created_at,
            }
        )
    return results


def get_customer_profile(db: Session, tenant_id: str) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminCustomerError(404, "Customer not found")

    owner = _get_owner(db, tenant_id)
    total_users = db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar() or 0
    total_invoices = db.query(func.count(Invoice.id)).filter(Invoice.tenant_id == tenant_id).scalar() or 0
    total_customers = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_revenue = (
        db.query(func.coalesce(func.sum(Invoice.total_amount), 0.0))
        .filter(Invoice.tenant_id == tenant_id, Invoice.created_at >= month_start)
        .scalar()
        or 0.0
    )
    outstanding_amount = (
        db.query(func.coalesce(func.sum(Invoice.outstanding_amount), 0.0))
        .filter(Invoice.tenant_id == tenant_id)
        .scalar()
        or 0.0
    )

    return {
        "tenant_id": tenant.id,
        "company_name": tenant.company_name,
        "legal_name": tenant.legal_name,
        "email": tenant.email,
        "phone": tenant.phone,
        "country": tenant.country,
        "status": tenant.status,
        "plan": _get_plan(db, tenant_id),
        "created_at": tenant.created_at,
        "owner_name": f"{owner.first_name} {owner.last_name}" if owner else None,
        "owner_email": owner.email if owner else tenant.email,
        "total_users": total_users,
        "total_invoices": total_invoices,
        "total_customers": total_customers,
        "monthly_revenue": round(monthly_revenue, 2),
        "outstanding_amount": round(outstanding_amount, 2),
        "last_login": owner.last_login if owner else None,
    }


def set_tenant_status(db: Session, tenant_id: str, status: str) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminCustomerError(404, "Customer not found")
    tenant.status = status
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def trigger_owner_password_reset(db: Session, tenant_id: str) -> str:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminCustomerError(404, "Customer not found")
    owner = _get_owner(db, tenant_id)
    email = owner.email if owner else tenant.email
    request_password_reset(db, email)
    return email
