from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.commerce import CommerceOrder, CommerceOrderItem
from app.schemas.commerce_dashboard import (
    ChannelComparisonRow,
    CommerceDashboardKpis,
    CommerceDashboardOut,
    CommerceTrendPoint,
    TopCommerceProduct,
)

PLATFORMS = ("swiggy", "zomato")


def _base_query(db: Session, tenant_id: str, date_from: date, date_to: date):
    return db.query(CommerceOrder).filter(
        CommerceOrder.tenant_id == tenant_id,
        func.date(CommerceOrder.order_time) >= date_from,
        func.date(CommerceOrder.order_time) <= date_to,
    )


def get_dashboard(db: Session, tenant_id: str, date_from: date, date_to: date) -> CommerceDashboardOut:
    non_cancelled = _base_query(db, tenant_id, date_from, date_to).filter(CommerceOrder.order_status != "cancelled")

    total_online_orders = non_cancelled.count()
    total_online_revenue = non_cancelled.with_entities(func.coalesce(func.sum(CommerceOrder.total_amount), 0.0)).scalar() or 0.0
    average_order_value = round(total_online_revenue / total_online_orders, 2) if total_online_orders else 0.0
    cancelled_orders = _base_query(db, tenant_id, date_from, date_to).filter(CommerceOrder.order_status == "cancelled").count()
    swiggy_orders = non_cancelled.filter(CommerceOrder.platform == "swiggy").count()
    zomato_orders = non_cancelled.filter(CommerceOrder.platform == "zomato").count()

    unmapped_sku_count = (
        db.query(func.count(func.distinct(CommerceOrderItem.platform_sku)))
        .join(CommerceOrder, CommerceOrderItem.commerce_order_id == CommerceOrder.id)
        .filter(CommerceOrder.tenant_id == tenant_id, CommerceOrderItem.product_id.is_(None))
        .scalar()
        or 0
    )

    channel_rows = (
        non_cancelled.with_entities(CommerceOrder.platform, func.sum(CommerceOrder.total_amount), func.count(CommerceOrder.id))
        .group_by(CommerceOrder.platform)
        .all()
    )
    revenue_by_platform = {platform: revenue or 0.0 for platform, revenue, _ in channel_rows}
    count_by_platform = {platform: count for platform, _, count in channel_rows}
    cancelled_by_platform = dict(
        _base_query(db, tenant_id, date_from, date_to)
        .filter(CommerceOrder.order_status == "cancelled")
        .with_entities(CommerceOrder.platform, func.count(CommerceOrder.id))
        .group_by(CommerceOrder.platform)
        .all()
    )
    channel_comparison = [
        ChannelComparisonRow(
            platform=platform,
            revenue=round(revenue_by_platform.get(platform, 0.0), 2),
            orders=count_by_platform.get(platform, 0),
            average_order_value=round(revenue_by_platform.get(platform, 0.0) / count_by_platform[platform], 2)
            if count_by_platform.get(platform)
            else 0.0,
            cancelled_orders=cancelled_by_platform.get(platform, 0),
        )
        for platform in PLATFORMS
    ]

    trend_rows = (
        non_cancelled.with_entities(
            func.date(CommerceOrder.order_time), CommerceOrder.platform, func.sum(CommerceOrder.total_amount), func.count(CommerceOrder.id)
        )
        .group_by(func.date(CommerceOrder.order_time), CommerceOrder.platform)
        .order_by(func.date(CommerceOrder.order_time))
        .all()
    )
    trend_map: dict[str, dict] = {}
    for d, platform, revenue, count in trend_rows:
        label = d if isinstance(d, str) else d.isoformat()
        bucket = trend_map.setdefault(label, {"swiggy": 0.0, "zomato": 0.0, "count": 0})
        bucket[platform] = revenue or 0.0
        bucket["count"] += count
    revenue_trend = [
        CommerceTrendPoint(
            bucket_label=label,
            swiggy_revenue=round(v["swiggy"], 2),
            zomato_revenue=round(v["zomato"], 2),
            total_revenue=round(v["swiggy"] + v["zomato"], 2),
            order_count=v["count"],
        )
        for label, v in sorted(trend_map.items())
    ]

    product_rows = (
        db.query(CommerceOrderItem.item_name, func.sum(CommerceOrderItem.quantity), func.sum(CommerceOrderItem.line_total))
        .join(CommerceOrder, CommerceOrderItem.commerce_order_id == CommerceOrder.id)
        .filter(
            CommerceOrder.tenant_id == tenant_id,
            CommerceOrder.order_status != "cancelled",
            func.date(CommerceOrder.order_time) >= date_from,
            func.date(CommerceOrder.order_time) <= date_to,
        )
        .group_by(CommerceOrderItem.item_name)
        .order_by(func.sum(CommerceOrderItem.quantity).desc())
        .limit(10)
        .all()
    )
    top_products = [
        TopCommerceProduct(product_name=name, quantity_sold=round(qty or 0.0, 2), revenue=round(rev or 0.0, 2))
        for name, qty, rev in product_rows
    ]

    return CommerceDashboardOut(
        kpis=CommerceDashboardKpis(
            total_online_orders=total_online_orders,
            swiggy_orders=swiggy_orders,
            zomato_orders=zomato_orders,
            total_online_revenue=round(total_online_revenue, 2),
            average_order_value=average_order_value,
            cancelled_orders=cancelled_orders,
            unmapped_sku_count=unmapped_sku_count,
        ),
        channel_comparison=channel_comparison,
        revenue_trend=revenue_trend,
        top_products=top_products,
    )
