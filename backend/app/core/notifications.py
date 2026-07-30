from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.notification import Notification

TYPE_LOW_STOCK = "low_stock"
TYPE_IMPORT_COMPLETED = "import_completed"
TYPE_INVOICE_CANCELLED = "invoice_cancelled"
TYPE_NEW_PRODUCT = "new_product"
TYPE_PAYMENT_RECEIVED = "payment_received"
TYPE_CREDIT_LIMIT_EXCEEDED = "credit_limit_exceeded"
TYPE_SUBSCRIPTION_EXPIRY = "subscription_expiry"
TYPE_TRIAL_ENDING_SOON = "trial_ending_soon"
TYPE_LIMIT_APPROACHING = "limit_approaching"


def create_notification(
    db: Session,
    *,
    tenant_id: str,
    type: str,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> None:
    db.add(
        Notification(
            tenant_id=tenant_id,
            type=type,
            title=title,
            message=message,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    )
