from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.feature_flag import TenantFeatureFlag
from app.models.tenant import Tenant

AVAILABLE_MODULES: dict[str, str] = {
    "pos_billing": "POS & Billing",
    "inventory": "Inventory",
    "customers": "Customers",
    "returns": "Returns & Refunds",
    "reports_analytics": "Reports & Analytics",
    "invoice_designer": "Invoice Designer",
    "payments_credit": "Payments & Credit",
}

COMING_SOON_MODULES: dict[str, str] = {
    "crm": "CRM",
    "purchase": "Purchase",
    "suppliers": "Suppliers",
    "warehouse": "Warehouse",
    "ai_assistant": "AI Assistant",
    "marketing": "Marketing",
    "loyalty": "Loyalty",
}


class AdminFeatureError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def list_feature_flags(db: Session, tenant_id: str) -> list[dict[str, Any]]:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminFeatureError(404, "Customer not found")

    flags = {
        flag.module_key: flag.enabled
        for flag in db.query(TenantFeatureFlag).filter(TenantFeatureFlag.tenant_id == tenant_id).all()
    }

    items = [
        {"module_key": key, "label": label, "enabled": flags.get(key, True), "available": True}
        for key, label in AVAILABLE_MODULES.items()
    ]
    items += [
        {"module_key": key, "label": label, "enabled": False, "available": False}
        for key, label in COMING_SOON_MODULES.items()
    ]
    return items


def set_feature_flag(db: Session, tenant_id: str, module_key: str, enabled: bool) -> None:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminFeatureError(404, "Customer not found")
    if module_key not in AVAILABLE_MODULES:
        raise AdminFeatureError(400, "This module cannot be toggled yet")

    flag = (
        db.query(TenantFeatureFlag)
        .filter(TenantFeatureFlag.tenant_id == tenant_id, TenantFeatureFlag.module_key == module_key)
        .first()
    )
    if flag:
        flag.enabled = enabled
        db.add(flag)
    else:
        db.add(TenantFeatureFlag(tenant_id=tenant_id, module_key=module_key, enabled=enabled))
    db.commit()


def get_enabled_flags_for_tenant(db: Session, tenant_id: str) -> dict[str, bool]:
    flags = {
        flag.module_key: flag.enabled
        for flag in db.query(TenantFeatureFlag).filter(TenantFeatureFlag.tenant_id == tenant_id).all()
    }
    return {key: flags.get(key, True) for key in AVAILABLE_MODULES}
