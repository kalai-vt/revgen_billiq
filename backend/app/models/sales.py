from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    invoice_number: Mapped[str] = mapped_column(String(30), index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="paid")
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    discount_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    discount_value: Mapped[float] = mapped_column(Float, default=0.0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0)
    taxable_amount: Mapped[float] = mapped_column(Float, default=0.0)
    tax_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    payment_method: Mapped[str] = mapped_column(String(10), default="cash")
    amount_tendered: Mapped[float | None] = mapped_column(Float, nullable=True)
    change_due: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    items: Mapped[list["InvoiceItem"]] = relationship(cascade="all, delete-orphan")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id"), index=True)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(200))
    identifier_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    identifier_value: Mapped[str] = mapped_column(String(80))
    quantity: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)
    tax_rate_percent: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    line_subtotal: Mapped[float] = mapped_column(Float)
    line_total: Mapped[float] = mapped_column(Float)
    returned_quantity: Mapped[float] = mapped_column(Float, default=0.0)
