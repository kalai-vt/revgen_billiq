from __future__ import annotations

import secrets

from sqlalchemy.orm import Session

from app.core.activity import log_activity
from app.core.crypto import encrypt_secret
from app.models.commerce import CommerceIntegrationConfig
from app.models.user import User
from app.schemas.commerce import CommerceIntegrationConfigOut, CommerceIntegrationConfigUpdate, CommercePlatform

MODULE_COMMERCE_CONFIG = "commerce_config"
ACTION_UPDATED = "updated"

PLATFORMS: list[CommercePlatform] = ["swiggy", "zomato"]


def _generate_webhook_token() -> str:
    return secrets.token_urlsafe(32)


def get_or_create_config(db: Session, tenant_id: str, platform: CommercePlatform, current_user: User) -> CommerceIntegrationConfig:
    config = (
        db.query(CommerceIntegrationConfig)
        .filter(CommerceIntegrationConfig.tenant_id == tenant_id, CommerceIntegrationConfig.platform == platform)
        .first()
    )
    if config is None:
        config = CommerceIntegrationConfig(
            tenant_id=tenant_id,
            platform=platform,
            webhook_token=_generate_webhook_token(),
            configured_by=current_user.id,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def list_configs(db: Session, tenant_id: str, current_user: User) -> list[CommerceIntegrationConfig]:
    return [get_or_create_config(db, tenant_id, platform, current_user) for platform in PLATFORMS]


def to_config_out(config: CommerceIntegrationConfig) -> CommerceIntegrationConfigOut:
    return CommerceIntegrationConfigOut(
        id=config.id,
        tenant_id=config.tenant_id,
        platform=config.platform,
        is_enabled=config.is_enabled,
        status=config.status,
        mode=config.mode,
        has_api_key=bool(config.api_key_encrypted),
        has_api_secret=bool(config.api_secret_encrypted),
        store_id=config.store_id,
        store_name=config.store_name,
        webhook_path=f"/api/commerce/webhooks/{config.platform}/{config.webhook_token}",
        last_synced_at=config.last_synced_at,
        last_sync_status=config.last_sync_status,
        auto_create_invoice=config.auto_create_invoice,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


def update_config(
    db: Session, config: CommerceIntegrationConfig, current_user: User, payload: CommerceIntegrationConfigUpdate
) -> CommerceIntegrationConfig:
    changed = payload.model_dump(exclude_unset=True, exclude={"api_key", "api_secret"})
    for field, value in changed.items():
        setattr(config, field, value)

    if payload.api_key is not None:
        config.api_key_encrypted = encrypt_secret(payload.api_key) if payload.api_key else None
    if payload.api_secret is not None:
        config.api_secret_encrypted = encrypt_secret(payload.api_secret) if payload.api_secret else None

    db.add(config)
    log_activity(
        db,
        tenant_id=config.tenant_id,
        user_id=current_user.id,
        module=MODULE_COMMERCE_CONFIG,
        action=ACTION_UPDATED,
        description=f"Updated {config.platform} integration settings",
        entity_type="CommerceIntegrationConfig",
        entity_id=config.id,
    )
    db.commit()
    db.refresh(config)
    return config


def regenerate_webhook_token(db: Session, config: CommerceIntegrationConfig, current_user: User) -> CommerceIntegrationConfig:
    config.webhook_token = _generate_webhook_token()
    db.add(config)
    log_activity(
        db,
        tenant_id=config.tenant_id,
        user_id=current_user.id,
        module=MODULE_COMMERCE_CONFIG,
        action=ACTION_UPDATED,
        description=f"Regenerated webhook token for {config.platform}",
        entity_type="CommerceIntegrationConfig",
        entity_id=config.id,
    )
    db.commit()
    db.refresh(config)
    return config
