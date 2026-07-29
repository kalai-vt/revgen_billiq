from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PurchaseEntryStatus = Literal["draft", "received", "cancelled"]
PurchaseEntryCreateStatus = Literal["draft", "received"]
PaymentStatus = Literal["unpaid", "partial", "paid"]


class PurchaseEntryItemCreate(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)
    unit: str | None = None
    unit_cost_price: float = Field(ge=0)
    tax_rate_percent: float = Field(default=0.0, ge=0, le=100)
    discount_amount: float = Field(default=0.0, ge=0)


class PurchaseEntryCreate(BaseModel):
    vendor_id: str
    vendor_invoice_number: str | None = None
    purchase_date: date
    items: list[PurchaseEntryItemCreate] = Field(min_length=1)
    payment_mode: str | None = None
    due_date: date | None = None
    remarks: str | None = None
    status: PurchaseEntryCreateStatus = "received"


class PurchaseCancelRequest(BaseModel):
    reason: str | None = None


class PurchaseEntryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    product_name: str
    quantity: float
    unit: str | None = None
    unit_cost_price: float
    tax_rate_percent: float
    tax_amount: float
    discount_amount: float
    line_subtotal: float
    line_total: float
    returned_quantity: float = 0.0


class PurchaseEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    vendor_id: str
    vendor_name: str
    purchase_number: str
    vendor_invoice_number: str | None = None
    purchase_date: date
    status: PurchaseEntryStatus
    subtotal: float
    discount_amount: float
    tax_amount: float
    total_amount: float
    payment_mode: str | None = None
    payment_status: PaymentStatus
    paid_amount: float
    outstanding_amount: float
    due_date: date | None = None
    remarks: str | None = None
    created_by: str
    created_by_name: str
    created_at: datetime
    cancelled_by: str | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    items: list[PurchaseEntryItemOut] = []


class PurchaseEntryListItemOut(BaseModel):
    id: str
    vendor_id: str
    vendor_name: str
    purchase_number: str
    vendor_invoice_number: str | None = None
    purchase_date: date
    status: PurchaseEntryStatus
    total_amount: float
    payment_status: PaymentStatus
    outstanding_amount: float
    created_at: datetime


class PurchaseEntryListOut(BaseModel):
    items: list[PurchaseEntryListItemOut]
    total: int
    page: int
    page_size: int
