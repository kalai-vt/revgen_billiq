from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.admin_deps import get_current_admin_user, require_admin_role
from app.core.db import get_db
from app.core.responses import make_response
from app.core.security import decode_access_token
from app.models.tenant import Tenant
from app.models.user import User
from app.models_admin.admin_user import AdminUser
from app.modules.promotion import service
from app.schemas.promotion import PromotionAnalyticsDay, PromotionAnalyticsOut, PromotionConfigOut, PromotionConfigUpdate

router = APIRouter(prefix="/api", tags=["promotion"])

# Same write-role set app/modules/admin_features/router.py restricts config mutations to.
_WRITE_ROLES = ("super_admin", "operations")


def _optional_tenant(request: Request, db: Session) -> Tenant | None:
    """Best-effort tenant resolution — never raises. This endpoint is called by anonymous
    print/PDF tabs as well as logged-in ones, and a missing/expired token should just mean
    "no personalized QR url", not a 401."""
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    payload = decode_access_token(auth_header.split(" ", 1)[1])
    if not payload:
        return None
    user = db.get(User, payload.get("sub"))
    if not user:
        return None
    return db.get(Tenant, user.tenant_id)


def _out(config, qr_url: str | None = None) -> dict[str, Any]:
    return PromotionConfigOut(
        version=config.version,
        title=config.title,
        description=config.description,
        website=config.website,
        phone=config.phone,
        cta_text=config.cta_text,
        qr_url=qr_url,
    ).model_dump()


@router.get("/v1/promotion/config")
def get_promotion_config(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    config = service.get_promotion_config(db)
    qr_url: str | None = None
    tenant = _optional_tenant(request, db)
    if tenant:
        tracking_id = service.get_or_create_tracking_id(db, tenant)
        qr_url = service.build_qr_redirect_url(tracking_id)
    return make_response(True, "BillIQ Promotion content loaded", _out(config, qr_url))


@router.get("/v1/promotion/r")
def redirect_promotion_qr(t: str, db: Session = Depends(get_db)) -> RedirectResponse:
    tenant = db.query(Tenant).filter(Tenant.promotion_tracking_id == t).first()
    service.log_qr_scan(db, tenant.id if tenant else None)
    return RedirectResponse(url=service.build_marketing_url(t), status_code=302)


@router.patch("/admin/promotion/config")
def update_promotion_config(
    payload: PromotionConfigUpdate,
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(require_admin_role(*_WRITE_ROLES)),
) -> dict[str, Any]:
    config = service.update_promotion_config(db, payload)
    return make_response(True, "BillIQ Promotion content updated", _out(config))


@router.get("/admin/promotion/analytics")
def get_promotion_analytics(
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    total, daily = service.get_analytics(db)
    out = PromotionAnalyticsOut(
        total_qr_scans=total,
        daily=[PromotionAnalyticsDay(date=d, qr_scans=c) for d, c in daily],
    )
    return make_response(True, "BillIQ Promotion analytics loaded", out.model_dump())
