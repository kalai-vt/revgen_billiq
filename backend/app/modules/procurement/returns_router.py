from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import require_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.procurement import returns_service as service
from app.modules.procurement.returns_service import PurchaseReturnError
from app.schemas.purchase_returns import PurchaseReturnCancelRequest, PurchaseReturnCreate

router = APIRouter(
    prefix="/api/procurement", tags=["procurement-returns"], dependencies=[Depends(require_feature("purchase_returns"))]
)


@router.get("/returns")
def get_returns(
    q: str | None = None,
    vendor_id: str | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: Literal["created_at", "refund_amount"] = Query(default="created_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_purchase_returns(
        db,
        current_user.tenant_id,
        q=q,
        vendor_id=vendor_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return make_response(
        True,
        "Purchase returns loaded",
        {"items": [i.model_dump(mode="json") for i in items], "total": total, "page": page, "page_size": page_size},
    )


@router.post("/returns")
def post_return(
    payload: PurchaseReturnCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        ret = service.create_purchase_return(db, current_user.tenant_id, current_user, payload)
    except PurchaseReturnError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    out = service.to_return_out(db, ret)
    return make_response(True, "Return recorded", out.model_dump(mode="json"))


@router.post("/returns/{return_id}/cancel")
def post_return_cancel(
    return_id: str,
    payload: PurchaseReturnCancelRequest,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ret = service.get_purchase_return(db, current_user.tenant_id, return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    try:
        ret = service.cancel_purchase_return(db, ret, current_user, payload.reason)
    except PurchaseReturnError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    out = service.to_return_out(db, ret)
    return make_response(True, "Return cancelled", out.model_dump(mode="json"))


@router.get("/returns/{return_id}")
def get_return_detail(
    return_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ret = service.get_purchase_return(db, current_user.tenant_id, return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    out = service.to_return_out(db, ret)
    return make_response(True, "Return loaded", out.model_dump(mode="json"))
