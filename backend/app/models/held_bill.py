from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class HeldBill(Base):
    __tablename__ = "held_bills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    customer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    discount_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    discount_value: Mapped[float] = mapped_column(Float, default=0.0)
    tax_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    payment_method: Mapped[str] = mapped_column(String(10), default="cash")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    lines: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
