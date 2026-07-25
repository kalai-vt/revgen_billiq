from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
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
    status: Mapped[str] = mapped_column(String(20), default="fully_refunded", index=True)
    subtotal_amount: Mapped[float] = mapped_column(Float, default=0.0)
    discount_adjustment: Mapped[float] = mapped_column(Float, default=0.0)
    tax_adjustment: Mapped[float] = mapped_column(Float, default=0.0)
    round_off: Mapped[float] = mapped_column(Float, default=0.0)
    refund_amount: Mapped[float] = mapped_column(Float, default=0.0)
    refund_method: Mapped[str] = mapped_column(String(20), default="cash")
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list["ReturnItem"]] = relationship(cascade="all, delete-orphan")


class ReturnItem(Base):
    __tablename__ = "return_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    return_id: Mapped[str] = mapped_column(String(36), ForeignKey("returns.id"), index=True)
    invoice_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoice_items.id"))
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(200))
    identifier_value: Mapped[str] = mapped_column(String(80), default="")
    quantity_returned: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)
    line_refund_amount: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(30), default="other")
    condition: Mapped[str] = mapped_column(String(20), default="sellable")
    inventory_action: Mapped[str] = mapped_column(String(20), default="return_to_stock")
    restocked: Mapped[bool] = mapped_column(Boolean, default=True)
