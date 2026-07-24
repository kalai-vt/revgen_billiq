from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.blob import upload_file
from app.core.timeutils import utc_now
from app.models.settings import Settings
from app.schemas.settings import SettingsUpdate

ALLOWED_LOGO_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg"}
MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024


class SettingsError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def get_settings(db: Session, tenant_id: str) -> Settings | None:
    return db.query(Settings).filter(Settings.tenant_id == tenant_id).first()


def save_logo(db: Session, settings: Settings, content: bytes, content_type: str) -> Settings:
    if content_type not in ALLOWED_LOGO_CONTENT_TYPES:
        raise SettingsError(400, "Logo must be a JPEG, PNG, WebP, or SVG image")
    if len(content) > MAX_LOGO_SIZE_BYTES:
        raise SettingsError(400, "Logo must be smaller than 2MB")

    ext = ALLOWED_LOGO_CONTENT_TYPES[content_type]
    url = upload_file(f"logos/{settings.tenant_id}.{ext}", content, content_type)

    settings.logo_url = f"{url}?v={int(utc_now().timestamp())}"
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def create_default_settings(db: Session, tenant_id: str, currency: str = "INR") -> Settings:
    settings = Settings(tenant_id=tenant_id, currency=currency)
    db.add(settings)
    db.flush()
    return settings


def update_settings(db: Session, settings: Settings, payload: SettingsUpdate) -> Settings:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings
