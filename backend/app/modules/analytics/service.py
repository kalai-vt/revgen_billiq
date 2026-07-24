from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.catalog import Product
from app.models.customer import Customer
from app.models.sales import Invoice, InvoiceItem
from app.models.tenant import Tenant
from app.schemas.analytics import (
    DailySalesPoint,
    DashboardKpis,
    DashboardOut,
    PaymentMethodBreakdown,
    RecentInvoice,
    TopProduct,
)


def _today_start_utc(tenant: Tenant) -> datetime:
    try:
        tz = ZoneInfo(tenant.timezone)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    local_now = datetime.now(tz)
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight.astimezone(timezone.utc)


def get_dashboard(db: Session, tenant: Tenant, days: int = 14) -> DashboardOut:
    tenant_id = tenant.id
    today_start = _today_start_utc(tenant)

    today_paid_query = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id, Invoice.status == "paid", Invoice.created_at >= today_start
    )
    today_bill_count = today_paid_query.with_entities(func.count(Invoice.id)).scalar() or 0
    today_revenue = (
        today_paid_query.with_entities(func.coalesce(func.sum(Invoice.total_amount), 0.0)).scalar() or 0.0
    )
    today_units_sold = (
        db.query(func.coalesce(func.sum(InvoiceItem.quantity), 0.0))
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .filter(Invoice.tenant_id == tenant_id, Invoice.status == "paid", Invoice.created_at >= today_start)
        .scalar()
        or 0.0
    )
    total_products = db.query(func.count(Product.id)).filter(Product.tenant_id == tenant_id, Product.is_active.is_(True)).scalar() or 0
    total_customers = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0

    kpis = DashboardKpis(
        today_revenue=float(today_revenue),
        today_bill_count=today_bill_count,
        today_units_sold=float(today_units_sold),
        total_products=total_products,
        total_customers=total_customers,
    )

    range_start = today_start - timedelta(days=days - 1)
    day_rows = (
        db.query(
            func.date(Invoice.created_at).label("day"),
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("revenue"),
            func.count(Invoice.id).label("bill_count"),
        )
        .filter(Invoice.tenant_id == tenant_id, Invoice.status == "paid", Invoice.created_at >= range_start)
        .group_by(func.date(Invoice.created_at))
        .all()
    )
    revenue_by_day = {str(row.day): (float(row.revenue), row.bill_count) for row in day_rows}
    daily_sales: list[DailySalesPoint] = []
    for offset in range(days):
        day = (range_start + timedelta(days=offset)).date().isoformat()
        revenue, bill_count = revenue_by_day.get(day, (0.0, 0))
        daily_sales.append(DailySalesPoint(date=day, revenue=revenue, bill_count=bill_count))

    top_product_rows = (
        db.query(
            InvoiceItem.product_id,
            InvoiceItem.product_name,
            InvoiceItem.identifier_value,
            func.sum(InvoiceItem.quantity).label("qty_sold"),
            func.sum(InvoiceItem.line_total).label("revenue"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .filter(Invoice.tenant_id == tenant_id, Invoice.status == "paid", Invoice.created_at >= range_start)
        .group_by(InvoiceItem.product_id, InvoiceItem.product_name, InvoiceItem.identifier_value)
        .order_by(func.sum(InvoiceItem.quantity).desc())
        .limit(5)
        .all()
    )
    top_products = [
        TopProduct(
            product_id=row.product_id,
            name=row.product_name,
            identifier_value=row.identifier_value,
            qty_sold=float(row.qty_sold),
            revenue=float(row.revenue),
        )
        for row in top_product_rows
    ]

    payment_rows = (
        db.query(
            Invoice.payment_method,
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("amount"),
            func.count(Invoice.id).label("count"),
        )
        .filter(Invoice.tenant_id == tenant_id, Invoice.status == "paid", Invoice.created_at >= range_start)
        .group_by(Invoice.payment_method)
        .all()
    )
    payment_methods = [
        PaymentMethodBreakdown(method=row.payment_method, amount=float(row.amount), count=row.count)
        for row in payment_rows
    ]

    recent_rows = (
        db.query(Invoice)
        .filter(Invoice.tenant_id == tenant_id)
        .order_by(Invoice.created_at.desc())
        .limit(10)
        .all()
    )
    recent_invoices = [
        RecentInvoice(
            id=row.id,
            invoice_number=row.invoice_number,
            customer_name=row.customer_name,
            total_amount=row.total_amount,
            payment_method=row.payment_method,
            status=row.status,
            created_at=row.created_at,
        )
        for row in recent_rows
    ]

    return DashboardOut(
        kpis=kpis,
        daily_sales=daily_sales,
        top_products=top_products,
        payment_methods=payment_methods,
        recent_invoices=recent_invoices,
    )
