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
from app.modules.procurement import purchases_service as service
from app.modules.procurement.purchases_service import PurchaseError
from app.schemas.purchases import PurchaseCancelRequest, PurchaseEntryCreate, PurchaseEntryOut

router = APIRouter(
    prefix="/api/procurement", tags=["procurement-purchases"], dependencies=[Depends(require_feature("purchase_entries"))]
)


@router.get("/purchases")
def get_purchases(
    q: str | None = None,
    vendor_id: str | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: Literal["purchase_date", "total_amount", "created_at"] = Query(default="created_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_purchase_entries(
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
        "Purchases loaded",
        {
            "items": [i.model_dump(mode="json") for i in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.post("/purchases")
def post_purchase(
    payload: PurchaseEntryCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        purchase = service.create_purchase_entry(db, current_user.tenant_id, current_user, payload)
    except PurchaseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    out = service.to_purchase_out(db, purchase)
    return make_response(True, "Purchase recorded", out.model_dump(mode="json"))


@router.post("/purchases/{purchase_id}/confirm")
def post_purchase_confirm(
    purchase_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    purchase = service.get_purchase_entry(db, current_user.tenant_id, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    try:
        purchase = service.confirm_purchase_entry(db, purchase, current_user)
    except PurchaseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    out = service.to_purchase_out(db, purchase)
    return make_response(True, "Purchase confirmed", out.model_dump(mode="json"))


@router.post("/purchases/{purchase_id}/cancel")
def post_purchase_cancel(
    purchase_id: str,
    payload: PurchaseCancelRequest,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    purchase = service.get_purchase_entry(db, current_user.tenant_id, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    try:
        purchase = service.cancel_purchase_entry(db, purchase, current_user, payload.reason)
    except PurchaseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    out = service.to_purchase_out(db, purchase)
    return make_response(True, "Purchase cancelled", out.model_dump(mode="json"))


# NOTE: catch-all single-segment route stays LAST among GET /purchases/* routes.
@router.get("/purchases/{purchase_id}")
def get_purchase_detail(
    purchase_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    purchase = service.get_purchase_entry(db, current_user.tenant_id, purchase_id)
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    out = service.to_purchase_out(db, purchase)
    return make_response(True, "Purchase loaded", out.model_dump(mode="json"))
