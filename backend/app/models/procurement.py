from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(150), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_terms_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    credit_limit: Mapped[float] = mapped_column(Float, default=0.0)
    outstanding_amount: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class PurchaseEntry(Base):
    __tablename__ = "purchase_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendors.id"), index=True)
    purchase_number: Mapped[str] = mapped_column(String(40), index=True)
    vendor_invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    purchase_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)  # draft|received|cancelled
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    payment_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")  # unpaid|partial|paid
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    outstanding_amount: Mapped[float] = mapped_column(Float, default=0.0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list["PurchaseEntryItem"]] = relationship(
        "PurchaseEntryItem", cascade="all, delete-orphan", back_populates="purchase_entry"
    )


class PurchaseEntryItem(Base):
    __tablename__ = "purchase_entry_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    purchase_entry_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchase_entries.id"), index=True)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    unit_cost_price: Mapped[float] = mapped_column(Float)
    tax_rate_percent: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0)
    line_subtotal: Mapped[float] = mapped_column(Float)
    line_total: Mapped[float] = mapped_column(Float)
    returned_quantity: Mapped[float] = mapped_column(Float, default=0.0)

    purchase_entry: Mapped["PurchaseEntry"] = relationship("PurchaseEntry", back_populates="items")


class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    purchase_entry_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchase_entries.id"), index=True)
    vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendors.id"), index=True)
    return_number: Mapped[str] = mapped_column(String(40), index=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="completed", index=True)  # completed|cancelled
    subtotal_amount: Mapped[float] = mapped_column(Float, default=0.0)
    tax_adjustment: Mapped[float] = mapped_column(Float, default=0.0)
    refund_amount: Mapped[float] = mapped_column(Float, default=0.0)
    refund_method: Mapped[str] = mapped_column(String(20), default="credit_note")  # credit_note|cash|bank_transfer
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list["PurchaseReturnItem"]] = relationship(
        "PurchaseReturnItem", cascade="all, delete-orphan", back_populates="purchase_return"
    )


class PurchaseReturnItem(Base):
    __tablename__ = "purchase_return_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    purchase_return_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchase_returns.id"), index=True)
    purchase_entry_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchase_entry_items.id"), index=True)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(200))
    quantity_returned: Mapped[float] = mapped_column(Float)
    unit_cost_price: Mapped[float] = mapped_column(Float)
    line_refund_amount: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(30), default="other")  # damaged|expired|wrong_item|quality_issue|other

    purchase_return: Mapped["PurchaseReturn"] = relationship("PurchaseReturn", back_populates="items")


class VendorPayment(Base):
    __tablename__ = "vendor_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendors.id"), index=True)
    payment_number: Mapped[str] = mapped_column(String(40), index=True)
    amount: Mapped[float] = mapped_column(Float)
    payment_method: Mapped[str] = mapped_column(String(20))
    reference_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    allocations: Mapped[list["VendorPaymentAllocation"]] = relationship(
        "VendorPaymentAllocation", cascade="all, delete-orphan", back_populates="vendor_payment"
    )


class VendorPaymentAllocation(Base):
    __tablename__ = "vendor_payment_allocations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    vendor_payment_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_payments.id"), index=True)
    purchase_entry_id: Mapped[str] = mapped_column(String(36), ForeignKey("purchase_entries.id"), index=True)
    amount: Mapped[float] = mapped_column(Float)

    vendor_payment: Mapped["VendorPayment"] = relationship("VendorPayment", back_populates="allocations")
