from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import require_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.procurement import dashboard_service as service

router = APIRouter(
    prefix="/api/procurement", tags=["procurement-dashboard"], dependencies=[Depends(require_feature("procurement"))]
)


@router.get("/dashboard")
def get_procurement_dashboard(
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    data = service.get_dashboard(db, current_user.tenant_id, date_from, date_to)
    return make_response(True, "Procurement dashboard loaded", data.model_dump(mode="json"))
