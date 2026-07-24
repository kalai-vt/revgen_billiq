from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import assert_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.analytics.service import get_dashboard
from app.modules.auth.service import get_tenant

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/analytics/dashboard")
def dashboard(
    days: int = Query(default=14, ge=1, le=90),
    advanced: bool = Query(default=False),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if advanced:
        assert_feature(db, current_user.tenant_id, "advanced_analytics")
    summary = get_dashboard(db, tenant, days=days)
    return make_response(True, "Dashboard analytics generated", summary.model_dump(mode="json"))
