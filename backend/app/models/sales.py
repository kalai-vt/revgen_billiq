from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import Date, DateTime, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("tenant_id", "client_reference_id", name="uq_invoices_tenant_client_reference"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    # An opaque client-generated id (one per checkout attempt, e.g. crypto.randomUUID()) that
    # makes create_invoice idempotent: a retried/duplicated POST with the same key returns the
    # already-created invoice instead of creating a second one. Nullable — a null value never
    # collides with another null under a standard unique index (every DB treats NULL <> NULL),
    # so invoices created before this existed, or via any path that doesn't set it, are unaffected.
    client_reference_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
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
    # The UPI/card transaction id, as read off the customer's payment app or the card terminal.
    # This is what lets a bill be matched back to a bank statement line; cash has none, so it is
    # nullable. Recording it is NOT proof of payment — it is a reconciliation aid, and nothing in
    # the app verifies it against a provider.
    payment_reference: Mapped[str | None] = mapped_column(String(80), nullable=True)
    amount_tendered: Mapped[float | None] = mapped_column(Float, nullable=True)
    change_due: Mapped[float | None] = mapped_column(Float, nullable=True)
    payment_status: Mapped[str] = mapped_column(String(20), default="paid", index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    outstanding_amount: Mapped[float] = mapped_column(Float, default=0.0)
    payment_terms: Mapped[str | None] = mapped_column(String(50), nullable=True)
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
