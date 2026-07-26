from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.admin_deps import get_current_admin_user
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.modules.admin_usage import service
from app.schemas.admin_usage import UsageAnalyticsItem

router = APIRouter(prefix="/api/admin/usage-analytics", tags=["admin-usage"])


@router.get("")
def list_usage_analytics(
    only_at_risk: bool = Query(default=False),
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    rows = service.list_usage_analytics(db, only_at_risk=only_at_risk)
    items = [UsageAnalyticsItem.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Usage analytics loaded", items)
