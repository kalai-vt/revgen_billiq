from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user, require_admin_role
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.models_admin.audit_log import AdminAuditLog
from app.modules.admin_features import service
from app.modules.admin_features.service import AdminFeatureError
from app.schemas.admin_features import FeatureFlagItem, FeatureFlagUpdateRequest

router = APIRouter(prefix="/api/admin/customers", tags=["admin-features"])


@router.get("/{tenant_id}/features")
def get_features(
    tenant_id: str,
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    try:
        rows = service.list_feature_flags(db, tenant_id)
    except AdminFeatureError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    items = [FeatureFlagItem.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Feature flags loaded", items)


@router.put("/{tenant_id}/features")
def update_feature(
    tenant_id: str,
    payload: FeatureFlagUpdateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin", "operations")),
) -> dict[str, Any]:
    try:
        service.set_feature_flag(db, tenant_id, payload.module_key, payload.enabled)
    except AdminFeatureError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    admin_db.add(
        AdminAuditLog(
            admin_user_id=current_admin.id,
            admin_user_name=f"{current_admin.first_name} {current_admin.last_name}",
            action="tenant.feature_flag_updated",
            target_type="tenant",
            target_id=tenant_id,
            details={"module_key": payload.module_key, "enabled": payload.enabled},
        )
    )
    admin_db.commit()
    return make_response(True, "Feature flag updated")
