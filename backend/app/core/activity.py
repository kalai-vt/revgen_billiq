from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog

# Module labels
MODULE_PRODUCT = "product"
MODULE_INVENTORY = "inventory"
MODULE_INVOICE = "invoice"
MODULE_CUSTOMER = "customer"
MODULE_PAYMENT = "payment"
MODULE_VENDOR = "vendor"
MODULE_PURCHASE = "purchase"
MODULE_PURCHASE_RETURN = "purchase_return"
MODULE_VENDOR_PAYMENT = "vendor_payment"

# Action labels
ACTION_CREATED = "created"
ACTION_UPDATED = "updated"
ACTION_DELETED = "deleted"
ACTION_STOCK_UPDATED = "stock_updated"
ACTION_CANCELLED = "cancelled"
ACTION_CREDIT_SETTINGS_UPDATED = "credit_settings_updated"
ACTION_PAYMENT_RECEIVED = "payment_received"
ACTION_CONFIRMED = "confirmed"


def log_activity(
    db: Session,
    *,
    tenant_id: str,
    user_id: str | None,
    module: str,
    action: str,
    description: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> None:
    db.add(
        ActivityLog(
            tenant_id=tenant_id,
            user_id=user_id,
            module=module,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            description=description,
        )
    )
