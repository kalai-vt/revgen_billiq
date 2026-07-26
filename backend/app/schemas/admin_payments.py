from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class PaymentListItem(BaseModel):
    id: str
    tenant_id: str
    company_name: str
    customer_name: str | None
    payment_number: str
    amount: float
    payment_method: str
    reference_number: str | None
    created_at: datetime


class PaymentsSummary(BaseModel):
    collected_this_month: float
    collected_all_time: float
    by_method: dict[str, float]
    outstanding_total: float
    tenants_with_outstanding: int
