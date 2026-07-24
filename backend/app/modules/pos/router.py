from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.pos import service
from app.modules.pos.service import HeldBillError
from app.schemas.pos import HeldBillCreate

router = APIRouter(prefix="/api/pos", tags=["pos"])


@router.post("/held-bills")
def post_held_bill(
    payload: HeldBillCreate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        held_bill = service.create_held_bill(db, current_user.tenant_id, current_user, payload)
    except HeldBillError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Bill held", held_bill.model_dump(mode="json"))


@router.get("/held-bills")
def get_held_bills(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items = service.list_held_bills(db, current_user.tenant_id)
    return make_response(
        True, "Held bills loaded", {"items": [hb.model_dump(mode="json") for hb in items], "total": len(items)}
    )


@router.get("/held-bills/{held_bill_id}")
def get_held_bill_detail(
    held_bill_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    held_bill = service.get_held_bill(db, current_user.tenant_id, held_bill_id)
    if not held_bill:
        raise HTTPException(status_code=404, detail="Held bill not found")
    return make_response(True, "Held bill loaded", held_bill.model_dump(mode="json"))


@router.delete("/held-bills/{held_bill_id}")
def delete_held_bill_route(
    held_bill_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    deleted = service.delete_held_bill(db, current_user.tenant_id, held_bill_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Held bill not found")
    return make_response(True, "Held bill deleted", {})
