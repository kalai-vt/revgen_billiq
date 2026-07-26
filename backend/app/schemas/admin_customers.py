from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AdminCustomerListItem(BaseModel):
    tenant_id: str
    company_name: str
    owner_name: str | None
    owner_email: str
    plan: str
    status: str
    total_invoices: int
    total_users: int
    last_login: datetime | None
    created_at: datetime


class AdminCustomerProfile(BaseModel):
    tenant_id: str
    company_name: str
    legal_name: str
    email: str
    phone: str
    country: str
    status: str
    plan: str
    created_at: datetime
    owner_name: str | None
    owner_email: str
    total_users: int
    total_invoices: int
    total_customers: int
    monthly_revenue: float
    outstanding_amount: float
    last_login: datetime | None
