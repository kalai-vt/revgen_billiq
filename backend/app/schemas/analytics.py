from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class DashboardKpis(BaseModel):
    today_revenue: float
    today_bill_count: int
    today_units_sold: float
    total_products: int
    total_customers: int


class DailySalesPoint(BaseModel):
    date: str
    revenue: float
    bill_count: int


class TopProduct(BaseModel):
    product_id: str
    name: str
    identifier_value: str
    qty_sold: float
    revenue: float


class PaymentMethodBreakdown(BaseModel):
    method: str
    amount: float
    count: int


class RecentInvoice(BaseModel):
    id: str
    invoice_number: str
    customer_name: str | None = None
    total_amount: float
    payment_method: str
    status: str
    created_at: datetime


class DashboardOut(BaseModel):
    kpis: DashboardKpis
    daily_sales: list[DailySalesPoint]
    top_products: list[TopProduct]
    payment_methods: list[PaymentMethodBreakdown]
    recent_invoices: list[RecentInvoice]
