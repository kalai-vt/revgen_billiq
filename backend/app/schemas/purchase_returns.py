from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ReturnReason = Literal["damaged", "expired", "wrong_item", "quality_issue", "other"]
RefundMethod = Literal["credit_note", "cash", "bank_transfer"]
PurchaseReturnStatus = Literal["completed", "cancelled"]


class PurchaseReturnLineCreate(BaseModel):
    purchase_entry_item_id: str
    quantity: float = Field(gt=0)
    reason: ReturnReason = "other"


class PurchaseReturnCreate(BaseModel):
    purchase_entry_id: str
    reason: str | None = None
    refund_method: RefundMethod = "credit_note"
    lines: list[PurchaseReturnLineCreate] = Field(min_length=1)


class PurchaseReturnCancelRequest(BaseModel):
    reason: str | None = None


class PurchaseReturnItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    purchase_entry_item_id: str
    product_id: str
    product_name: str
    quantity_returned: float
    unit_cost_price: float
    line_refund_amount: float
    reason: ReturnReason


class PurchaseReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    purchase_entry_id: str
    purchase_number: str = ""
    vendor_id: str
    vendor_name: str = ""
    return_number: str
    reason: str | None = None
    status: PurchaseReturnStatus
    subtotal_amount: float
    tax_adjustment: float
    refund_amount: float
    refund_method: RefundMethod
    created_by: str
    created_by_name: str = ""
    created_at: datetime
    cancelled_by: str | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    items: list[PurchaseReturnItemOut] = []


class PurchaseReturnListItemOut(BaseModel):
    id: str
    return_number: str
    purchase_entry_id: str
    purchase_number: str
    vendor_id: str
    vendor_name: str
    status: PurchaseReturnStatus
    refund_amount: float
    created_at: datetime


class PurchaseReturnListOut(BaseModel):
    items: list[PurchaseReturnListItemOut]
    total: int
    page: int
    page_size: int
