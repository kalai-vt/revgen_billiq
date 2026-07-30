from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TenantLimitOverride(Base):
    """Per-tenant override of a plan's numeric usage limit, set by a Super Admin. Mirrors
    `TenantFeatureFlag`'s override-beats-plan-default shape (see `get_effective_limits` in
    `app/core/limits.py`, which resolves the same way `get_effective_flags_for_tenant` does).
    A `NULL` `limit_value` means unlimited, overriding a plan's finite default.
    """

    __tablename__ = "tenant_limit_overrides"
    __table_args__ = (UniqueConstraint("tenant_id", "limit_key", name="uq_tenant_limit_overrides_tenant_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    limit_key: Mapped[str] = mapped_column(String(50), index=True)
    limit_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_by: Mapped[str] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
