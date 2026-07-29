from __future__ import annotations

from pydantic import BaseModel


class ProcurementDashboardKpis(BaseModel):
    today_purchase_value: float = 0.0
    month_purchase_value: float = 0.0
    range_purchase_value: float = 0.0
    range_purchase_count: int = 0
    active_vendors_count: int = 0
    outstanding_vendor_payments: float = 0.0


class TopVendorOut(BaseModel):
    vendor_id: str
    vendor_name: str
    total_amount: float
    purchase_count: int


class ProcurementDashboardOut(BaseModel):
    kpis: ProcurementDashboardKpis
    top_vendors: list[TopVendorOut] = []
