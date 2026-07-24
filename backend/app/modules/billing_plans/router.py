from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.responses import make_response
from app.models.user import User
from app.modules.auth.service import get_tenant
from app.modules.billing_plans.service import get_usage

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/usage")
def get_billing_usage(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return make_response(True, "Usage loaded", get_usage(db, tenant))
