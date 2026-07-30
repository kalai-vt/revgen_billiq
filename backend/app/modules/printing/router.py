from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from app.core.responses import make_response
from app.models.user import User
from app.modules.printing import service
from app.modules.printing.service import QzSigningError
from app.schemas.printing import QzSignRequest

router = APIRouter(prefix="/api/printing", tags=["printing"])


@router.get("/qz-certificate")
def get_qz_certificate(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return make_response(True, "QZ Tray certificate loaded", {"certificate": service.get_certificate()})


@router.post("/qz-sign")
def post_qz_sign(payload: QzSignRequest, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    try:
        signature = service.sign(payload.to_sign)
    except QzSigningError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return make_response(True, "Request signed", {"signature": signature})
