from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

Granularity = Literal["day", "week", "month"]


class DateRangeMeta(BaseModel):
    date_from: date
    date_to: date
    days: int
    granularity: Granularity
    preset: str | None = None


class DashboardKpis(BaseModel):
    # Window-scoped (respect the selected date range)
    total_sales: float
    net_sales: float
    total_orders: int
    average_order_value: float
    new_customers: int
    credit_sales: float
    cash_sales: float
    card_payments: float
    upi_payments: float
    returned_orders: int
    returned_amount: float
    discount_amount: float
    tax_collected: float
    # Running totals "as of now" — NOT window-scoped
    total_customers: int
    total_products: int
    outstanding_amount: float


class TrendPoint(BaseModel):
    bucket_start: date
    bucket_label: str
    revenue: float
    order_count: int


class HourlyPoint(BaseModel):
    hour: int
    revenue: float
    order_count: int


class TopProduct(BaseModel):
    product_id: str
    name: str
    identifier_value: str
    qty_sold: float
    revenue: float


class TopCategory(BaseModel):
    category_id: str | None
    name: str
    qty_sold: float
    revenue: float


class PaymentMethodBreakdown(BaseModel):
    method: str
    amount: float
    count: int


class EmployeeSales(BaseModel):
    user_id: str
    name: str
    revenue: float
    order_count: int


class TaxBreakdownRow(BaseModel):
    tax_rate_percent: float
    taxable_amount: float
    tax_amount: float


class DiscountAnalysis(BaseModel):
    total_discount: float
    discounted_invoice_count: int
    total_invoice_count: int
    avg_discount_percent: float


class RecentInvoice(BaseModel):
    id: str
    invoice_number: str
    customer_name: str | None = None
    total_amount: float
    payment_method: str
    status: str
    created_at: datetime


class DashboardOut(BaseModel):
    meta: DateRangeMeta
    kpis: DashboardKpis
    sales_trend: list[TrendPoint]
    hourly_sales: list[HourlyPoint]
    payment_methods: list[PaymentMethodBreakdown]
    top_products: list[TopProduct]
    top_categories: list[TopCategory]
    sales_by_employee: list[EmployeeSales]
    tax_breakdown: list[TaxBreakdownRow]
    discount_analysis: DiscountAnalysis
    recent_invoices: list[RecentInvoice]
