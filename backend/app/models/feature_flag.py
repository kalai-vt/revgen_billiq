from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

FLAG_STATUSES = ("enabled", "disabled", "suspended")
ACCESS_LEVELS = ("full_access", "read_only")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TenantFeatureFlag(Base):
    __tablename__ = "tenant_feature_flags"
    __table_args__ = (UniqueConstraint("tenant_id", "module_key", name="uq_tenant_feature_flags_tenant_module"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    module_key: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="enabled")
    hidden_from_nav: Mapped[bool] = mapped_column(Boolean, default=False)
    access_level: Mapped[str] = mapped_column(String(20), default="full_access")
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_by_admin_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_by_admin_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class TenantFeatureFlagHistory(Base):
    __tablename__ = "tenant_feature_flag_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    module_key: Mapped[str] = mapped_column(String(50), index=True)
    action: Mapped[str] = mapped_column(String(30))
    previous_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    changed_by_admin_id: Mapped[str] = mapped_column(String(36))
    changed_by_admin_name: Mapped[str] = mapped_column(String(200))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class FeatureSchedule(Base):
    __tablename__ = "feature_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    module_key: Mapped[str] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(20))
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_by_admin_id: Mapped[str] = mapped_column(String(36))
    created_by_admin_name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
