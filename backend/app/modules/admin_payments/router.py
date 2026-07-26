from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.admin_deps import get_current_admin_user
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.modules.admin_payments import service
from app.schemas.admin_payments import PaymentListItem, PaymentsSummary

router = APIRouter(prefix="/api/admin/payments", tags=["admin-payments"])


@router.get("")
def list_payments(
    tenant_id: str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=50, le=200, ge=1),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    result = service.list_payments(
        db,
        tenant_id=tenant_id,
        payment_method=payment_method,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    items = [PaymentListItem.model_validate(row).model_dump(mode="json") for row in result["items"]]
    return make_response(True, "Payments loaded", {"items": items, "total": result["total"]})


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    summary = service.get_payments_summary(db)
    return make_response(True, "Payments summary loaded", PaymentsSummary.model_validate(summary).model_dump(mode="json"))
