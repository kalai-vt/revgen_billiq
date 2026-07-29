from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import require_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.procurement import vendor_payments_service as service
from app.modules.procurement.vendor_payments_service import VendorPaymentError
from app.schemas.vendor_payments import VendorPaymentCreate

router = APIRouter(
    prefix="/api/procurement", tags=["procurement-vendor-payments"], dependencies=[Depends(require_feature("vendor_payments"))]
)


@router.get("/vendor-payments")
def get_vendor_payments(
    vendor_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_vendor_payments(db, current_user.tenant_id, vendor_id=vendor_id, page=page, page_size=page_size)
    return make_response(
        True,
        "Vendor payments loaded",
        {"items": [i.model_dump(mode="json") for i in items], "total": total, "page": page, "page_size": page_size},
    )


@router.post("/vendor-payments")
def post_vendor_payment(
    payload: VendorPaymentCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        payment = service.create_vendor_payment(db, current_user.tenant_id, current_user, payload)
    except VendorPaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    out = service.to_payment_out(db, payment)
    return make_response(True, "Payment recorded", out.model_dump(mode="json"))


@router.get("/vendors/{vendor_id}/outstanding-purchases")
def get_vendor_outstanding_purchases(
    vendor_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items = service.list_outstanding_purchases(db, current_user.tenant_id, vendor_id)
    return make_response(True, "Outstanding purchases loaded", [i.model_dump(mode="json") for i in items])


@router.get("/vendors/{vendor_id}/ledger")
def get_vendor_ledger_route(
    vendor_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        ledger = service.get_vendor_ledger(db, current_user.tenant_id, vendor_id)
    except VendorPaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Vendor ledger loaded", ledger.model_dump(mode="json"))
