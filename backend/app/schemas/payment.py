from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PaymentMethod = Literal["cash", "card", "upi", "bank_transfer", "wallet", "cheque"]
LedgerEntryType = Literal["invoice", "payment", "return", "adjustment"]
AgeingBucket = Literal["current", "1-30", "31-60", "61-90", "90+"]


class PaymentAllocationCreate(BaseModel):
    invoice_id: str
    amount: float = Field(gt=0)


class PaymentCreate(BaseModel):
    customer_id: str
    amount: float = Field(gt=0)
    payment_method: PaymentMethod
    reference_number: str | None = None
    notes: str | None = None
    # Omitted/empty => auto-allocate oldest-due-first across the customer's outstanding invoices.
    allocations: list[PaymentAllocationCreate] | None = None


class PaymentAllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_id: str
    invoice_number: str = ""
    amount: float


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    customer_id: str
    customer_name: str = ""
    payment_number: str
    amount: float
    payment_method: PaymentMethod
    reference_number: str | None = None
    notes: str | None = None
    received_by: str
    received_by_name: str = ""
    created_at: datetime
    allocations: list[PaymentAllocationOut] = []


class PaymentListOut(BaseModel):
    items: list[PaymentOut]
    total: int
    page: int
    page_size: int


class OutstandingInvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_number: str
    created_at: datetime
    due_date: date | None = None
    total_amount: float
    paid_amount: float
    outstanding_amount: float
    payment_status: str
    is_overdue: bool = False


class LedgerAdjustmentCreate(BaseModel):
    amount: float = Field(description="Positive increases what the customer owes, negative decreases it")
    reason: str = Field(min_length=1)


class LedgerEntryOut(BaseModel):
    date: datetime
    type: LedgerEntryType
    reference: str
    description: str
    debit: float
    credit: float
    balance: float


class CustomerLedgerOut(BaseModel):
    customer_id: str
    customer_name: str
    opening_balance: float
    closing_balance: float
    entries: list[LedgerEntryOut]


class TrendPoint(BaseModel):
    date: date
    amount: float


class CreditSummaryOut(BaseModel):
    current_outstanding: float
    total_outstanding_invoices: int
    total_overdue_amount: float
    total_overdue_invoices: int
    last_payment_date: datetime | None = None
    average_payment_days: float | None = None
    outstanding_trend: list[TrendPoint]


class OutstandingDashboardOut(BaseModel):
    total_outstanding: float
    total_overdue: float
    today_collections: float
    due_today: int
    due_this_week: int
    overdue_customers: int
    customers_on_credit: int
    average_collection_days: float | None = None
    outstanding_trend: list[TrendPoint]
    collection_trend: list[TrendPoint]
    ageing_distribution: dict[AgeingBucket, float]


class AgeingInvoiceOut(BaseModel):
    invoice_id: str
    invoice_number: str
    customer_id: str | None = None
    customer_name: str | None = None
    due_date: date | None = None
    outstanding_amount: float
    days_overdue: int
    bucket: AgeingBucket


class AgeingCustomerOut(BaseModel):
    customer_id: str
    customer_name: str
    current: float
    bucket_1_30: float
    bucket_31_60: float
    bucket_61_90: float
    bucket_90_plus: float
    total_outstanding: float


class AgeingReportOut(BaseModel):
    invoices: list[AgeingInvoiceOut]
    by_customer: list[AgeingCustomerOut]
