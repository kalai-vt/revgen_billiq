from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class PurchaseTrendPoint(BaseModel):
    bucket_label: str
    purchase_value: float
    purchase_count: int


class VendorAnalysisRow(BaseModel):
    vendor_id: str
    vendor_name: str
    purchase_value: float
    purchase_count: int
    purchase_quantity: float
    outstanding_amount: float


class ProductAnalysisRow(BaseModel):
    product_id: str
    product_name: str
    quantity_purchased: float
    purchase_value: float
    avg_cost_price: float


class ProcurementAnalyticsKpis(BaseModel):
    total_purchase_value: float = 0.0
    total_purchase_count: int = 0
    total_return_value: float = 0.0
    inventory_value: float = 0.0
    gross_profit: float = 0.0
    gross_margin_percent: float = 0.0


class ProcurementAnalyticsOut(BaseModel):
    kpis: ProcurementAnalyticsKpis
    purchase_trend: list[PurchaseTrendPoint] = []
    vendor_analysis: list[VendorAnalysisRow] = []
    product_analysis: list[ProductAnalysisRow] = []


class PurchaseReportRow(BaseModel):
    purchase_number: str
    vendor_name: str
    purchase_date: date
    status: str
    total_amount: float
    payment_status: str
    outstanding_amount: float


class VendorReportRow(BaseModel):
    vendor_name: str
    purchase_count: int
    total_purchase_value: float
    total_outstanding: float
    is_active: bool


class OutstandingVendorReportRow(BaseModel):
    vendor_name: str
    outstanding_amount: float
    credit_limit: float
    phone: str | None = None


class PurchaseReturnReportRow(BaseModel):
    return_number: str
    purchase_number: str
    vendor_name: str
    status: str
    refund_amount: float
    created_at: datetime


class GstReportRow(BaseModel):
    tax_rate_percent: float
    taxable_amount: float
    tax_amount: float


class ProcurementReportsOut(BaseModel):
    purchase_report: list[PurchaseReportRow] = []
    vendor_report: list[VendorReportRow] = []
    outstanding_vendor_report: list[OutstandingVendorReportRow] = []
    purchase_return_report: list[PurchaseReturnReportRow] = []
    gst_report: list[GstReportRow] = []
