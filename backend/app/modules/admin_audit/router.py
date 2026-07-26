from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.modules.admin_audit import service
from app.schemas.admin_audit import AdminAuditLogOut

router = APIRouter(prefix="/api/admin/audit-logs", tags=["admin-audit"])


@router.get("")
def list_logs(
    action: str | None = Query(default=None),
    target_type: str | None = Query(default=None),
    admin_user_id: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=50, le=200, ge=1),
    offset: int = Query(default=0, ge=0),
    admin_db: Session = Depends(get_admin_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    result = service.list_audit_logs(
        admin_db,
        action=action,
        target_type=target_type,
        admin_user_id=admin_user_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    items = [AdminAuditLogOut.model_validate(row).model_dump(mode="json") for row in result["items"]]
    return make_response(True, "Audit logs loaded", {"items": items, "total": result["total"]})


@router.get("/actions")
def list_actions(
    admin_db: Session = Depends(get_admin_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    return make_response(True, "Actions loaded", service.list_distinct_actions(admin_db))
