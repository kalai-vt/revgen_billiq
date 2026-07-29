from __future__ import annotations

from pydantic import BaseModel


class CommerceDashboardKpis(BaseModel):
    total_online_orders: int = 0
    swiggy_orders: int = 0
    zomato_orders: int = 0
    total_online_revenue: float = 0.0
    average_order_value: float = 0.0
    cancelled_orders: int = 0
    unmapped_sku_count: int = 0


class ChannelComparisonRow(BaseModel):
    platform: str
    revenue: float
    orders: int
    average_order_value: float
    cancelled_orders: int
    growth_percent: float | None = None


class CommerceTrendPoint(BaseModel):
    bucket_label: str
    swiggy_revenue: float = 0.0
    zomato_revenue: float = 0.0
    total_revenue: float = 0.0
    order_count: int = 0


class TopCommerceProduct(BaseModel):
    product_name: str
    quantity_sold: float
    revenue: float


class CommerceDashboardOut(BaseModel):
    kpis: CommerceDashboardKpis
    channel_comparison: list[ChannelComparisonRow] = []
    revenue_trend: list[CommerceTrendPoint] = []
    top_products: list[TopCommerceProduct] = []
