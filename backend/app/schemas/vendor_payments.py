from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

VendorPaymentMethod = Literal["cash", "card", "upi", "bank_transfer", "cheque"]
VendorLedgerEntryType = Literal["purchase", "payment", "return"]


class VendorPaymentAllocationCreate(BaseModel):
    purchase_entry_id: str
    amount: float = Field(gt=0)


class VendorPaymentCreate(BaseModel):
    vendor_id: str
    amount: float = Field(gt=0)
    payment_method: VendorPaymentMethod
    reference_number: str | None = None
    notes: str | None = None
    # Omitted/empty => auto-allocate oldest-due-first across the vendor's outstanding purchases.
    allocations: list[VendorPaymentAllocationCreate] | None = None


class VendorPaymentAllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    purchase_entry_id: str
    purchase_number: str = ""
    amount: float


class VendorPaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    vendor_id: str
    vendor_name: str = ""
    payment_number: str
    amount: float
    payment_method: VendorPaymentMethod
    reference_number: str | None = None
    notes: str | None = None
    paid_by: str
    paid_by_name: str = ""
    created_at: datetime
    allocations: list[VendorPaymentAllocationOut] = []


class VendorPaymentListOut(BaseModel):
    items: list[VendorPaymentOut]
    total: int
    page: int
    page_size: int


class OutstandingPurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    purchase_number: str
    purchase_date: date
    total_amount: float
    paid_amount: float
    outstanding_amount: float
    payment_status: str


class VendorLedgerEntryOut(BaseModel):
    date: datetime
    type: VendorLedgerEntryType
    reference: str
    description: str
    debit: float
    credit: float
    balance: float


class VendorLedgerOut(BaseModel):
    vendor_id: str
    vendor_name: str
    opening_balance: float
    closing_balance: float
    entries: list[VendorLedgerEntryOut]
