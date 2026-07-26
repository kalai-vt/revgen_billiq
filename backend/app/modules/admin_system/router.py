from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.modules.admin_audit.service import list_audit_logs
from app.modules.admin_system.service import get_system_health
from app.schemas.admin_audit import AdminAuditLogOut

router = APIRouter(prefix="/api/admin/system", tags=["admin-system"])


@router.get("/health")
def health(
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    return make_response(True, "System health loaded", get_system_health(db, admin_db))


@router.get("/activity")
def recent_activity(
    admin_db: Session = Depends(get_admin_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    result = list_audit_logs(admin_db, limit=25, offset=0)
    items = [AdminAuditLogOut.model_validate(row).model_dump(mode="json") for row in result["items"]]
    return make_response(True, "Recent activity loaded", items)
