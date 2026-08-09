from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.checkout_elements import CHECKOUT_ELEMENT_REGISTRY, GROUP_LABELS
from app.core.db import get_db
from app.core.deps import get_current_user, require_role
from app.core.limits import assert_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.auth.service import get_tenant
from app.modules.admin_features.service import get_effective_flags_for_tenant
from app.modules.settings import service
from app.modules.settings.service import AccountDeletionError, SettingsError
from app.schemas.settings import (
    BrandingOut,
    BusinessPreferencesOut,
    CheckoutConfigOut,
    CheckoutConfigUpdate,
    CheckoutElementCatalogOut,
    DeleteAccountRequest,
    ProductConfigOut,
    SettingsOut,
    SettingsUpdate,
)

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


@router.get("/settings/checkout-elements/catalog")
def get_checkout_elements_catalog(_current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    catalog = CheckoutElementCatalogOut(
        groups=dict(GROUP_LABELS),
        elements=[
            {"key": e["key"], "label": e["label"], "group": e["group"], "depends_on_module": e["depends_on_module"]}
            for e in CHECKOUT_ELEMENT_REGISTRY
        ],
    )
    return make_response(True, "Checkout element catalog loaded", catalog.model_dump(mode="json"))


@router.get("/settings/checkout-config")
def get_checkout_config(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    settings = service.get_settings(db, current_user.tenant_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    config = CheckoutConfigOut(config=service.get_checkout_config(settings))
    return make_response(True, "Checkout configuration loaded", config.model_dump(mode="json"))


@router.put("/settings/checkout-config")
def put_checkout_config(
    payload: CheckoutConfigUpdate,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    settings = service.get_settings(db, current_user.tenant_id)
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    try:
        resolved = service.update_checkout_config(db, settings, payload.config)
    except SettingsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Checkout configuration updated", CheckoutConfigOut(config=resolved).model_dump(mode="json"))


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


@router.get("/settings/export-data")
def get_export_data(
    current_user: User = Depends(require_role("owner")), db: Session = Depends(get_db)
) -> Response:
    archive = service.export_tenant_data(db, current_user.tenant_id)
    return Response(
        content=archive,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="revgen-billiq-data-export.zip"'},
    )


@router.post("/settings/delete-account")
def post_delete_account(
    payload: DeleteAccountRequest,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    try:
        service.delete_account(db, current_user, tenant, payload.password)
    except AccountDeletionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Account deleted. You have been signed out.", None)
