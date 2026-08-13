from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.catalog import ProductOut


class HeldBillLineIn(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)
    unit_price: float | None = Field(default=None, ge=0)


class HeldBillCreate(BaseModel):
    customer_name: str | None = None
    customer_phone: str | None = None
    lines: list[HeldBillLineIn] = Field(min_length=1)
    discount_type: Literal["flat", "percent"] | None = None
    discount_value: float = Field(default=0.0, ge=0)
    # Same nullable contract as InvoiceCreate.tax_percentage — None means "no manual
    # override was set when this bill was held," so resuming it keeps auto per-product tax
    # instead of silently freezing in a blended rate. See InvoiceCreate's own comment.
    tax_percentage: float | None = Field(default=None, ge=0, le=100)
    payment_method: Literal["cash", "card", "upi"] = "cash"
    notes: str | None = None


class HeldBillLineOut(BaseModel):
    product: ProductOut
    quantity: float
    unit_price: float | None = None


class HeldBillOut(BaseModel):
    id: str
    tenant_id: str
    customer_name: str | None = None
    customer_phone: str | None = None
    discount_type: str | None = None
    discount_value: float
    tax_percentage: float | None = None
    payment_method: str
    notes: str | None = None
    lines: list[HeldBillLineOut]
    created_by: str
    created_by_name: str = ""
    created_at: datetime
