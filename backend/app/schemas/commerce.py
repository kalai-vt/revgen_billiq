from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CommercePlatform = Literal["swiggy", "zomato"]
IntegrationStatus = Literal["not_connected", "pending_partner_approval", "connected", "error"]
IntegrationMode = Literal["mock", "live"]
CommerceOrderStatus = Literal["received", "preparing", "ready", "dispatched", "delivered", "cancelled"]


class CommerceIntegrationConfigUpdate(BaseModel):
    is_enabled: bool | None = None
    mode: IntegrationMode | None = None
    api_key: str | None = None
    api_secret: str | None = None
    store_id: str | None = None
    store_name: str | None = None
    auto_create_invoice: bool | None = None
    status: IntegrationStatus | None = None


class CommerceIntegrationConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    platform: CommercePlatform
    is_enabled: bool
    status: IntegrationStatus
    mode: IntegrationMode
    has_api_key: bool = False
    has_api_secret: bool = False
    store_id: str | None = None
    store_name: str | None = None
    webhook_path: str = ""
    last_synced_at: datetime | None = None
    last_sync_status: str | None = None
    auto_create_invoice: bool
    created_at: datetime
    updated_at: datetime


class CommerceOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str | None = None
    platform_sku: str
    item_name: str
    quantity: float
    unit_price: float
    line_total: float


class CommerceOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    platform: CommercePlatform
    platform_order_id: str
    order_status: CommerceOrderStatus
    raw_status: str | None = None
    order_time: datetime
    customer_name: str | None = None
    customer_phone: str | None = None
    subtotal: float
    platform_discount: float
    platform_commission: float
    packaging_charge: float
    tax_amount: float
    total_amount: float
    payout_amount: float
    invoice_id: str | None = None
    invoice_number: str | None = None
    sync_error: str | None = None
    created_at: datetime
    items: list[CommerceOrderItemOut] = []


class CommerceOrderListItemOut(BaseModel):
    id: str
    platform: CommercePlatform
    platform_order_id: str
    order_status: CommerceOrderStatus
    order_time: datetime
    customer_name: str | None = None
    total_amount: float
    invoice_id: str | None = None
    sync_error: str | None = None


class CommerceOrderListOut(BaseModel):
    items: list[CommerceOrderListItemOut]
    total: int
    page: int
    page_size: int


class MockOrderTriggerRequest(BaseModel):
    platform: CommercePlatform
    item_count: int = Field(default=2, ge=1, le=5)


class CommerceProductMappingCreate(BaseModel):
    platform: CommercePlatform
    platform_sku: str
    product_id: str


class CommerceProductMappingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    platform: CommercePlatform
    platform_sku: str
    platform_item_name: str | None = None
    product_id: str
    product_name: str = ""
    created_at: datetime


class UnmappedSkuOut(BaseModel):
    platform: CommercePlatform
    platform_sku: str
    item_name: str
    order_count: int


class CommerceSyncLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    platform: CommercePlatform
    sync_type: str
    status: str
    orders_processed: int
    orders_failed: int
    error_message: str | None = None
    started_at: datetime
    completed_at: datetime | None = None
