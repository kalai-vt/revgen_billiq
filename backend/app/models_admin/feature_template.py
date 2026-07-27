from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.admin_db import AdminBase


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FeatureTemplate(AdminBase):
    __tablename__ = "feature_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # List of {"module_key": str, "enabled": bool, "config": dict | None}
    modules: Mapped[list] = mapped_column(JSON)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_admin_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_by_admin_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
