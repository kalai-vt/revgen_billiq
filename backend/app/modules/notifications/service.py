from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.notification import Notification


class NotificationError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def list_notifications(
    db: Session, tenant_id: str, unread_only: bool = False, limit: int = 50
) -> tuple[list[Notification], int, int]:
    query = db.query(Notification).filter(Notification.tenant_id == tenant_id)
    unread_count = (
        db.query(func.count(Notification.id))
        .filter(Notification.tenant_id == tenant_id, Notification.is_read.is_(False))
        .scalar()
        or 0
    )
    total = query.with_entities(func.count(Notification.id)).scalar() or 0
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    items = query.order_by(Notification.created_at.desc()).limit(limit).all()
    return items, total, unread_count


def mark_read(db: Session, tenant_id: str, notification_id: str) -> Notification:
    notification = (
        db.query(Notification)
        .filter(Notification.tenant_id == tenant_id, Notification.id == notification_id)
        .first()
    )
    if not notification:
        raise NotificationError(404, "Notification not found")
    notification.is_read = True
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def mark_all_read(db: Session, tenant_id: str) -> None:
    db.query(Notification).filter(Notification.tenant_id == tenant_id, Notification.is_read.is_(False)).update(
        {"is_read": True}
    )
    db.commit()
