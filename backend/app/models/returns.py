from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Return(Base):
    __tablename__ = "returns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id"), index=True)
    return_number: Mapped[str] = mapped_column(String(30), index=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    refund_amount: Mapped[float] = mapped_column(Float, default=0.0)
    refund_method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    items: Mapped[list["ReturnItem"]] = relationship(cascade="all, delete-orphan")


class ReturnItem(Base):
    __tablename__ = "return_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    return_id: Mapped[str] = mapped_column(String(36), ForeignKey("returns.id"), index=True)
    invoice_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoice_items.id"))
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(200))
    quantity_returned: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)
    line_refund_amount: Mapped[float] = mapped_column(Float)
