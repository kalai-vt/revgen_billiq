from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.admin_deps import get_current_admin_user
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.modules.admin_dashboard.service import get_dashboard_summary

router = APIRouter(prefix="/api/admin/dashboard", tags=["admin-dashboard"])


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    return make_response(True, "Dashboard summary loaded", get_dashboard_summary(db))
