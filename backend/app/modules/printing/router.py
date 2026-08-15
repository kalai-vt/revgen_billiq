from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.responses import make_response
from app.models.user import User
from app.modules.printing import service
from app.modules.printing.service import PrintAgentError, QzSigningError
from app.schemas.printing import (
    PairingCodeOut,
    PairRequest,
    PrintAgentDeviceOut,
    QzSignRequest,
    SessionTokenRequest,
)

router = APIRouter(prefix="/api/printing", tags=["printing"])


@router.get("/qz-certificate")
@limiter.limit("30/minute")
def get_qz_certificate(request: Request, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return make_response(True, "QZ Tray certificate loaded", {"certificate": service.get_certificate()})


@router.post("/qz-sign")
@limiter.limit("30/minute")
def post_qz_sign(request: Request, payload: QzSignRequest, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    try:
        signature = service.sign(payload.to_sign)
    except QzSigningError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return make_response(True, "Request signed", {"signature": signature})


# --- RevGenAI Print Agent: pairing, devices, and session tokens (see service.py header comment) ---


@router.post("/agent/pairing-code")
@limiter.limit("30/minute")
def post_agent_pairing_code(
    request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, Any]:
    pairing_code = service.create_pairing_code(db, current_user.tenant_id, current_user.id)
    return make_response(
        True,
        "Pairing code generated",
        PairingCodeOut(code=pairing_code.code, expires_at=pairing_code.expires_at).model_dump(mode="json"),
    )


@router.post("/agent/pair")
# Unauthenticated: called by the local Print Agent process, which has no user session. Limited
# more strictly than the authenticated endpoints since an unauthenticated, code-guessing attack
# surface (a 6-digit pairing code) is the thing being protected here.
@limiter.limit("10/hour")
def post_agent_pair(request: Request, payload: PairRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        device, device_secret = service.pair_device(
            db, payload.pairing_code, payload.platform, payload.agent_version, payload.device_fingerprint
        )
    except PrintAgentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    # `device_secret` is returned here and only here — it is never stored (only its SHA-256 hash
    # is) and can never be recovered again once this response is sent. `tenant_id` lets the agent
    # pin which tenant it trusts (see print-agent's config.ts/server.ts) — session tokens are all
    # signed with one global keypair shared by every tenant, so this is what actually prevents a
    # validly-signed token minted for a different tenant from being accepted here.
    return make_response(
        True, "Device paired", {"device_id": device.id, "device_secret": device_secret, "tenant_id": device.tenant_id}
    )


@router.post("/agent/session-token")
@limiter.limit("60/minute")
def post_agent_session_token(
    request: Request,
    payload: SessionTokenRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        device = service.get_active_device_for_tenant(db, payload.device_id, current_user.tenant_id)
        token_payload = service.build_session_token_payload(device.id, current_user.tenant_id, current_user.id)
        token, signature = service.sign_session_token(token_payload)
    except PrintAgentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    service.touch_device_last_seen(db, device)

    return make_response(True, "Session token issued", {"token": token, "signature": signature})


@router.get("/agent/token-public-key")
# Unauthenticated: it's a public key, not a secret — the agent needs it before (or without) a
# user session in order to verify signed session tokens.
@limiter.limit("30/minute")
def get_agent_token_public_key(request: Request) -> dict[str, Any]:
    return make_response(True, "Print Agent token public key loaded", {"public_key": service.get_token_public_key()})


@router.get("/agent/download")
# Unauthenticated and deliberately a plain redirect (not a JSON-wrapped URL) — a Settings-page
# download button is a plain <a href> tag, and browsers don't attach the Bearer auth header to
# ordinary navigation, so gating this behind auth would just break the button. The installer
# itself carries no tenant-specific data (same binary for every customer), so there's nothing to
# protect here the way there is for the pairing/session-token endpoints above.
@limiter.limit("30/minute")
def get_agent_download(request: Request) -> RedirectResponse:
    if not settings.print_agent_download_url:
        raise HTTPException(status_code=404, detail="The Print Agent installer isn't available for download yet.")
    return RedirectResponse(settings.print_agent_download_url, status_code=307)


@router.get("/agent/devices")
@limiter.limit("30/minute")
def get_agent_devices(
    request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, Any]:
    devices = service.list_devices(db, current_user.tenant_id)
    items = [PrintAgentDeviceOut.model_validate(device).model_dump(mode="json") for device in devices]
    return make_response(True, "Devices loaded", items)


@router.post("/agent/devices/{device_id}/revoke")
@limiter.limit("30/minute")
def post_agent_device_revoke(
    request: Request, device_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        device = service.revoke_device(db, device_id, current_user.tenant_id)
    except PrintAgentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(
        True,
        "Device revoked",
        PrintAgentDeviceOut.model_validate(device).model_dump(mode="json"),
    )
