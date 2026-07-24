from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog

# Module labels
MODULE_PRODUCT = "product"
MODULE_INVENTORY = "inventory"
MODULE_INVOICE = "invoice"
MODULE_AUTH = "auth"

# Action labels
ACTION_CREATED = "created"
ACTION_UPDATED = "updated"
ACTION_DELETED = "deleted"
ACTION_STOCK_UPDATED = "stock_updated"
ACTION_CANCELLED = "cancelled"
ACTION_LOGIN = "login"
ACTION_LOGOUT = "logout"


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
