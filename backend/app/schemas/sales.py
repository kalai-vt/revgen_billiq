from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PaymentType = Literal["paid", "partial", "credit"]


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
    # None (the default) means "tax each line at its own product's rate" — the correct
    # behavior for a mixed-tax-rate cart, computed server-side from each line's product. A
    # number means the cashier manually overrode tax for the whole cart, applied uniformly to
    # every line as before (see create_invoice) — that path is unchanged and still tested by
    # test_manual_tax.py.
    tax_percentage: float | None = Field(default=None, ge=0, le=100)
    payment_method: Literal["cash", "card", "upi"]
    amount_tendered: float | None = Field(default=None, ge=0)
    payment_type: PaymentType = "paid"
    paid_now: float = Field(default=0.0, ge=0)
    due_date: date | None = None
    # One opaque id per checkout attempt (e.g. crypto.randomUUID() on the frontend, reused
    # across retries of the SAME attempt). A repeated request with the same key returns the
    # already-created invoice instead of creating a second one — see create_invoice. Optional
    # so any other caller of this API that doesn't send one just gets today's behavior.
    idempotency_key: str | None = Field(default=None, max_length=64)


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
    created_by_name: str = ""
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
    payment_status: str = "paid"
    due_date: date | None = None
    paid_amount: float = 0.0
    outstanding_amount: float = 0.0
    payment_terms: str | None = None
    is_overdue: bool = False
    created_at: datetime
    items: list[InvoiceItemOut] = []


ReturnReason = Literal["damaged", "wrong_item", "expired", "changed_mind", "duplicate_purchase", "other"]
ReturnCondition = Literal["sellable", "damaged", "expired", "opened"]
InventoryAction = Literal["return_to_stock", "mark_damaged", "discard"]
RefundMethod = Literal["cash", "card", "upi", "bank_transfer"]
ReturnStatus = Literal["fully_refunded", "partially_refunded", "cancelled"]


class ReturnLineCreate(BaseModel):
    invoice_item_id: str
    quantity: float = Field(gt=0)
    reason: ReturnReason = "other"
    condition: ReturnCondition = "sellable"
    inventory_action: InventoryAction = "return_to_stock"


class ReturnCreate(BaseModel):
    lines: list[ReturnLineCreate] = Field(min_length=1)
    refund_method: RefundMethod | None = None


class ReturnCancelRequest(BaseModel):
    reason: str = Field(min_length=1)


class ReturnItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_item_id: str
    product_id: str
    product_name: str
    identifier_value: str = ""
    quantity_returned: float
    unit_price: float
    line_refund_amount: float
    reason: ReturnReason = "other"
    condition: ReturnCondition = "sellable"
    inventory_action: InventoryAction = "return_to_stock"
    restocked: bool = True


class ReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    invoice_id: str
    invoice_number: str = ""
    return_number: str
    status: ReturnStatus = "fully_refunded"
    subtotal_amount: float = 0.0
    discount_adjustment: float = 0.0
    tax_adjustment: float = 0.0
    round_off: float = 0.0
    refund_amount: float
    refund_method: RefundMethod = "cash"
    created_by: str
    created_by_name: str = ""
    created_at: datetime
    cancelled_by: str | None = None
    cancelled_by_name: str | None = None
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    cashier_name: str = ""
    payment_method: str = ""
    items: list[ReturnItemOut] = []


class ReturnsDashboardOut(BaseModel):
    today_return_count: int
    today_refund_amount: float
    month_return_count: int
    today_returned_product_qty: float
