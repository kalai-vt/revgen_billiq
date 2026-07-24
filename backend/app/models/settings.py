from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), unique=True, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    invoice_prefix: Mapped[str] = mapped_column(String(20), default="INV")
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    theme: Mapped[str] = mapped_column(String(16), default="light")
    plan: Mapped[str] = mapped_column(String(20), default="basic")
    allow_manager_price_override: Mapped[bool] = mapped_column(Boolean, default=False)
    primary_search_field: Mapped[str] = mapped_column(String(20), default="identifier_value")
    default_identifier_type: Mapped[str] = mapped_column(String(20), default="pid")
    enable_multiple_identifiers: Mapped[bool] = mapped_column(Boolean, default=False)
    require_unique_identifier: Mapped[bool] = mapped_column(Boolean, default=True)

    # Invoice settings
    starting_invoice_number: Mapped[int] = mapped_column(Integer, default=1)
    receipt_footer: Mapped[str | None] = mapped_column(Text, nullable=True)
    decimal_precision: Mapped[int] = mapped_column(Integer, default=2)
    date_format: Mapped[str] = mapped_column(String(20), default="DD/MM/YYYY")

    # Business preferences
    default_tax_percent: Mapped[float] = mapped_column(Float, default=0.0)
    allow_discounts: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_print_after_checkout: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_barcode: Mapped[bool] = mapped_column(Boolean, default=True)
    enable_customer_selection: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    default_low_stock_threshold: Mapped[float] = mapped_column(Float, default=5.0)
    default_payment_method: Mapped[str] = mapped_column(String(10), default="cash")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
