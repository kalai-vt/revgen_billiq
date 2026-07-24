from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog
from app.models.user import User
from app.schemas.activity import ActivityLogOut


def _to_out(db: Session, entry: ActivityLog) -> ActivityLogOut:
    user = db.get(User, entry.user_id) if entry.user_id else None
    return ActivityLogOut(
        id=entry.id,
        module=entry.module,
        action=entry.action,
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        description=entry.description,
        user_id=entry.user_id,
        user_name=f"{user.first_name} {user.last_name}" if user else "System",
        created_at=entry.created_at,
    )


def list_activity_log(
    db: Session,
    tenant_id: str,
    page: int = 1,
    page_size: int = 20,
    module: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[ActivityLogOut], int]:
    query = db.query(ActivityLog).filter(ActivityLog.tenant_id == tenant_id)
    if module:
        query = query.filter(ActivityLog.module == module)
    if date_from:
        query = query.filter(ActivityLog.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        query = query.filter(ActivityLog.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))

    total = query.with_entities(func.count(ActivityLog.id)).scalar() or 0
    items = (
        query.order_by(ActivityLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    )
    return [_to_out(db, item) for item in items], total
