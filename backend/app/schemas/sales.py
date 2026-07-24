from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class InvoiceLineCreate(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)
    unit_price: float | None = Field(default=None, ge=0)


class InvoiceCreate(BaseModel):
    customer_id: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    lines: list[InvoiceLineCreate] = Field(min_length=1)
    discount_type: Literal["flat", "percent"] | None = None
    discount_value: float = Field(default=0.0, ge=0)
    tax_percentage: float = Field(default=0.0, ge=0, le=100)
    payment_method: Literal["cash", "card", "upi"]
    amount_tendered: float | None = Field(default=None, ge=0)


class InvoiceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    product_name: str
    identifier_type: str | None = None
    identifier_value: str
    quantity: float
    unit_price: float
    tax_rate_percent: float
    tax_amount: float
    line_subtotal: float
    line_total: float
    returned_quantity: float = 0.0


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    invoice_number: str
    created_by: str
    customer_id: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    gst_number: str | None = None
    status: str
    subtotal: float
    discount_type: str | None = None
    discount_value: float
    discount_amount: float
    taxable_amount: float
    tax_percentage: float
    tax_amount: float
    total_amount: float
    payment_method: str
    amount_tendered: float | None = None
    change_due: float | None = None
    created_at: datetime
    items: list[InvoiceItemOut] = []


class ReturnLineCreate(BaseModel):
    invoice_item_id: str
    quantity: float = Field(gt=0)


class ReturnCreate(BaseModel):
    lines: list[ReturnLineCreate] = Field(min_length=1)
    reason: str | None = None


class ReturnItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_item_id: str
    product_id: str
    product_name: str
    quantity_returned: float
    unit_price: float
    line_refund_amount: float


class ReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    invoice_id: str
    invoice_number: str = ""
    return_number: str
    reason: str | None = None
    refund_amount: float
    refund_method: str | None = None
    created_by: str
    created_at: datetime
    items: list[ReturnItemOut] = []
