from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import require_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.procurement import vendors_service as service
from app.modules.procurement.vendors_service import VendorError
from app.schemas.vendors import VendorCreate, VendorOut, VendorUpdate

router = APIRouter(prefix="/api/procurement", tags=["procurement-vendors"], dependencies=[Depends(require_feature("vendors"))])


@router.get("/vendors")
def get_vendors(
    q: str | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: Literal["name", "outstanding_amount", "created_at"] = Query(default="name"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_vendors(
        db, current_user.tenant_id, q=q, is_active=is_active, page=page, page_size=page_size, sort_by=sort_by, sort_dir=sort_dir
    )
    return make_response(
        True,
        "Vendors loaded",
        {
            "items": [VendorOut.model_validate(i).model_dump(mode="json") for i in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.get("/vendors/picker")
def get_vendors_picker(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items = service.list_vendors_for_picker(db, current_user.tenant_id)
    return make_response(True, "Vendors loaded", [VendorOut.model_validate(i).model_dump(mode="json") for i in items])


@router.post("/vendors")
def post_vendor(
    payload: VendorCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vendor = service.create_vendor(db, current_user.tenant_id, current_user, payload)
    return make_response(True, "Vendor created", VendorOut.model_validate(vendor).model_dump(mode="json"))


@router.put("/vendors/{vendor_id}")
def put_vendor(
    vendor_id: str,
    payload: VendorUpdate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vendor = service.get_vendor(db, current_user.tenant_id, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    vendor = service.update_vendor(db, vendor, current_user, payload)
    return make_response(True, "Vendor updated", VendorOut.model_validate(vendor).model_dump(mode="json"))


@router.delete("/vendors/{vendor_id}")
def remove_vendor(
    vendor_id: str,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vendor = service.get_vendor(db, current_user.tenant_id, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    try:
        service.delete_vendor(db, vendor)
    except VendorError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Vendor deleted", {})


# NOTE: catch-all single-segment route stays LAST among GET /vendors/* routes so it doesn't
# shadow the literal "/vendors/picker" path above.
@router.get("/vendors/{vendor_id}")
def get_vendor_detail(
    vendor_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    vendor = service.get_vendor(db, current_user.tenant_id, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return make_response(True, "Vendor loaded", VendorOut.model_validate(vendor).model_dump(mode="json"))
