from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.promotion import PromotionConfig, PromotionEvent
from app.models.tenant import Tenant
from app.schemas.promotion import PromotionConfigUpdate

_SINGLETON_ID = "default"


def get_promotion_config(db: Session) -> PromotionConfig:
    config = db.get(PromotionConfig, _SINGLETON_ID)
    if not config:
        # Should only happen if the seed migration hasn't run yet (e.g. a fresh test DB that
        # creates tables via metadata.create_all rather than alembic) — fall back to the same
        # copy the migration seeds, so callers never see a missing-config error.
        config = PromotionConfig(
            id=_SINGLETON_ID,
            version="1.0",
            title="Powered by RevGenAI BillIQ",
            description="Smart Billing • Inventory • Analytics",
            website="revgenai.in/billiq",
            phone="8680844026",
            cta_text="Want BillIQ for your business? Scan to learn more",
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def update_promotion_config(db: Session, payload: PromotionConfigUpdate) -> PromotionConfig:
    config = get_promotion_config(db)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(config, key, value)
    if updates:
        try:
            major, minor = config.version.split(".", 1)
            config.version = f"{major}.{int(minor) + 1}"
        except ValueError:
            config.version = "1.1"
    db.commit()
    db.refresh(config)
    return config


def get_or_create_tracking_id(db: Session, tenant: Tenant) -> str:
    """Lazily generates and persists an opaque marketing identifier for this tenant.

    Deliberately not derived from tenant.id — a random token that only this table can map
    back to a tenant, so it never leaks the real database id via a printed QR code.
    """
    if tenant.promotion_tracking_id:
        return tenant.promotion_tracking_id

    for _ in range(5):
        candidate = secrets.token_urlsafe(8)
        exists = db.query(Tenant.id).filter(Tenant.promotion_tracking_id == candidate).first()
        if not exists:
            tenant.promotion_tracking_id = candidate
            db.commit()
            db.refresh(tenant)
            return candidate
    raise RuntimeError("Could not generate a unique promotion tracking id")


def build_qr_redirect_url(tracking_id: str) -> str:
    return f"{settings.api_base_url}/api/v1/promotion/r?t={tracking_id}"


def build_marketing_url(tracking_id: str) -> str:
    query = urlencode({"source": "invoice", "tenant": tracking_id})
    return f"{settings.revgenai_marketing_url}?{query}"


def log_qr_scan(db: Session, tenant_id: str | None) -> None:
    db.add(PromotionEvent(event_type="qr_scanned", tenant_id=tenant_id))
    db.commit()


def get_analytics(db: Session, days: int = 30) -> tuple[int, list[tuple[str, int]]]:
    total = db.query(func.count(PromotionEvent.id)).filter(PromotionEvent.event_type == "qr_scanned").scalar() or 0

    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(func.date(PromotionEvent.created_at), func.count(PromotionEvent.id))
        .filter(PromotionEvent.event_type == "qr_scanned", PromotionEvent.created_at >= since)
        .group_by(func.date(PromotionEvent.created_at))
        .order_by(func.date(PromotionEvent.created_at))
        .all()
    )
    daily = [(str(day), count) for day, count in rows]
    return total, daily
