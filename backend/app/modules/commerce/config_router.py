from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import assert_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.commerce import config_service as service
from app.schemas.commerce import CommerceIntegrationConfigUpdate, CommercePlatform

router = APIRouter(prefix="/api/commerce", tags=["commerce-config"])


def _require_platform_feature(db: Session, tenant_id: str, platform: CommercePlatform) -> None:
    assert_feature(db, tenant_id, f"commerce_{platform}")


@router.get("/configs")
def get_configs(
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    assert_feature(db, current_user.tenant_id, "commerce")
    configs = service.list_configs(db, current_user.tenant_id, current_user)
    return make_response(True, "Integration settings loaded", [service.to_config_out(c).model_dump(mode="json") for c in configs])


@router.get("/configs/{platform}")
def get_config(
    platform: CommercePlatform,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _require_platform_feature(db, current_user.tenant_id, platform)
    config = service.get_or_create_config(db, current_user.tenant_id, platform, current_user)
    return make_response(True, "Integration settings loaded", service.to_config_out(config).model_dump(mode="json"))


@router.put("/configs/{platform}")
def put_config(
    platform: CommercePlatform,
    payload: CommerceIntegrationConfigUpdate,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _require_platform_feature(db, current_user.tenant_id, platform)
    config = service.get_or_create_config(db, current_user.tenant_id, platform, current_user)
    config = service.update_config(db, config, current_user, payload)
    return make_response(True, "Integration settings updated", service.to_config_out(config).model_dump(mode="json"))


@router.post("/configs/{platform}/regenerate-webhook-token")
def post_regenerate_webhook_token(
    platform: CommercePlatform,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _require_platform_feature(db, current_user.tenant_id, platform)
    config = service.get_or_create_config(db, current_user.tenant_id, platform, current_user)
    config = service.regenerate_webhook_token(db, config, current_user)
    return make_response(True, "Webhook token regenerated", service.to_config_out(config).model_dump(mode="json"))
