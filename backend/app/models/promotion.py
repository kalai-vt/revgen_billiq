from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PromotionConfig(Base):
    """Singleton, centrally-managed BillIQ promotional content shown on printed bills.

    Always exactly one row (id="default"). Updated only via the admin-authenticated
    endpoint in app/modules/promotion/, so RevGenAI can change the copy without shipping
    a new app release. Never merged into a tenant's invoice data — see document_data.py.
    """

    __tablename__ = "promotion_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default="default")
    version: Mapped[str] = mapped_column(String(20), default="1.0")
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(200))
    website: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(50))
    cta_text: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class PromotionEvent(Base):
    """A single BillIQ Promotion marketing event (currently only QR scans).

    Intentionally minimal — no customer data, no invoice reference. tenant_id is kept for
    internal attribution only and is never returned by any API response.
    """

    __tablename__ = "promotion_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    event_type: Mapped[str] = mapped_column(String(30), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
