from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CommerceIntegrationConfig(Base):
    __tablename__ = "commerce_integration_configs"
    __table_args__ = (UniqueConstraint("tenant_id", "platform", name="uq_commerce_config_tenant_platform"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    platform: Mapped[str] = mapped_column(String(20), index=True)  # swiggy|zomato
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30), default="not_connected")  # not_connected|pending_partner_approval|connected|error
    mode: Mapped[str] = mapped_column(String(10), default="mock")  # mock|live
    api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    store_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    store_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    webhook_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    auto_create_invoice: Mapped[bool] = mapped_column(Boolean, default=True)
    configured_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class CommerceOrder(Base):
    __tablename__ = "commerce_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "platform", "platform_order_id", name="uq_commerce_order_tenant_platform_order"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    platform: Mapped[str] = mapped_column(String(20), index=True)
    integration_config_id: Mapped[str] = mapped_column(String(36), ForeignKey("commerce_integration_configs.id"), index=True)
    platform_order_id: Mapped[str] = mapped_column(String(100), index=True)
    order_status: Mapped[str] = mapped_column(String(20), index=True)  # received|preparing|ready|dispatched|delivered|cancelled
    raw_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    order_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    customer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    platform_discount: Mapped[float] = mapped_column(Float, default=0.0)
    platform_commission: Mapped[float] = mapped_column(Float, default=0.0)
    packaging_charge: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    payout_amount: Mapped[float] = mapped_column(Float, default=0.0)
    invoice_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("invoices.id"), nullable=True, index=True)
    sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    items: Mapped[list["CommerceOrderItem"]] = relationship(
        "CommerceOrderItem", cascade="all, delete-orphan", back_populates="order"
    )


class CommerceOrderItem(Base):
    __tablename__ = "commerce_order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    commerce_order_id: Mapped[str] = mapped_column(String(36), ForeignKey("commerce_orders.id"), index=True)
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id"), nullable=True)
    platform_sku: Mapped[str] = mapped_column(String(100))
    item_name: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)
    line_total: Mapped[float] = mapped_column(Float)

    order: Mapped["CommerceOrder"] = relationship("CommerceOrder", back_populates="items")


class CommerceProductMapping(Base):
    __tablename__ = "commerce_product_mappings"
    __table_args__ = (UniqueConstraint("tenant_id", "platform", "platform_sku", name="uq_commerce_mapping_tenant_platform_sku"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    platform: Mapped[str] = mapped_column(String(20), index=True)
    platform_sku: Mapped[str] = mapped_column(String(100), index=True)
    platform_item_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CommerceSyncLog(Base):
    __tablename__ = "commerce_sync_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    integration_config_id: Mapped[str] = mapped_column(String(36), ForeignKey("commerce_integration_configs.id"), index=True)
    platform: Mapped[str] = mapped_column(String(20), index=True)
    sync_type: Mapped[str] = mapped_column(String(20))  # webhook|manual|mock
    status: Mapped[str] = mapped_column(String(20))  # success|failed|partial
    orders_processed: Mapped[int] = mapped_column(Integer, default=0)
    orders_failed: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
