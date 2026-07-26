from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models_admin.audit_log import AdminAuditLog


def list_audit_logs(
    admin_db: Session,
    *,
    action: str | None = None,
    target_type: str | None = None,
    admin_user_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    query = admin_db.query(AdminAuditLog)
    if action:
        query = query.filter(AdminAuditLog.action == action)
    if target_type:
        query = query.filter(AdminAuditLog.target_type == target_type)
    if admin_user_id:
        query = query.filter(AdminAuditLog.admin_user_id == admin_user_id)
    if date_from:
        query = query.filter(AdminAuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AdminAuditLog.created_at <= date_to)

    total = query.with_entities(func.count(AdminAuditLog.id)).scalar() or 0
    items = query.order_by(AdminAuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": items, "total": total}


def list_distinct_actions(admin_db: Session) -> list[str]:
    rows = admin_db.query(AdminAuditLog.action).distinct().order_by(AdminAuditLog.action.asc()).all()
    return [row[0] for row in rows]
