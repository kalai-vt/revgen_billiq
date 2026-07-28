from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_role
from app.core.limits import assert_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.admin_features.service import get_effective_flags_for_tenant
from app.modules.settings import service
from app.modules.settings.service import SettingsError
from app.schemas.settings import BrandingOut, BusinessPreferencesOut, ProductConfigOut, SettingsOut, SettingsUpdate

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/feature-flags")
def get_feature_flags(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return make_response(True, "Feature flags loaded", get_effective_flags_for_tenant(db, current_user.tenant_id))


@router.get("/settings")
def get_settings(
    current_user: User = Depends(require_role("owner")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    settings = service.get_settings(db, current_user.tenant_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return make_response(True, "Settings loaded", SettingsOut.model_validate(settings).model_dump(mode="json"))


@router.get("/settings/branding")
def get_branding(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    settings = service.get_settings(db, current_user.tenant_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return make_response(True, "Branding loaded", BrandingOut.model_validate(settings).model_dump(mode="json"))


@router.get("/settings/product-config")
def get_product_config(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    settings = service.get_settings(db, current_user.tenant_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return make_response(
        True, "Product configuration loaded", ProductConfigOut.model_validate(settings).model_dump(mode="json")
    )


@router.get("/settings/business-preferences")
def get_business_preferences(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    settings = service.get_settings(db, current_user.tenant_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return make_response(
        True, "Business preferences loaded", BusinessPreferencesOut.model_validate(settings).model_dump(mode="json")
    )


@router.put("/settings")
def put_settings(
    payload: SettingsUpdate,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    settings = service.get_settings(db, current_user.tenant_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    settings = service.update_settings(db, settings, payload)
    return make_response(True, "Settings updated", SettingsOut.model_validate(settings).model_dump(mode="json"))


@router.post("/settings/logo")
async def post_settings_logo(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    assert_feature(db, current_user.tenant_id, "custom_branding")
    settings = service.get_settings(db, current_user.tenant_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    content = await file.read()
    try:
        settings = service.save_logo(db, settings, content, file.content_type or "")
    except SettingsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Logo updated", SettingsOut.model_validate(settings).model_dump(mode="json"))
