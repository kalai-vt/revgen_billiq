from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.catalog import Category, Product
from app.models.customer import Customer
from app.models.returns import Return
from app.models.sales import Invoice, InvoiceItem
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.analytics import (
    DashboardKpis,
    DashboardOut,
    DateRangeMeta,
    DiscountAnalysis,
    EmployeeSales,
    Granularity,
    HourlyPoint,
    PaymentMethodBreakdown,
    RecentInvoice,
    TaxBreakdownRow,
    TopCategory,
    TopProduct,
    TrendPoint,
)

# Invoices in these statuses count as real sales for revenue-flow KPIs. `cancelled` and
# `refunded` are excluded; `partial` is included (a partially-paid sale is still a real sale,
# just not fully collected yet) — this differs from the original dashboard, which only counted
# `paid` and silently dropped partial/credit sales from revenue entirely.
_SALE_STATUSES = ("paid", "partial")


class AnalyticsError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


@dataclass
class AnalyticsWindow:
    tenant_id: str
    date_from: date
    date_to: date
    start_utc: datetime  # inclusive
    end_utc: datetime  # exclusive
    days: int
    granularity: Granularity
    preset: str | None


def _tenant_zone(tenant: Tenant) -> ZoneInfo:
    try:
        return ZoneInfo(tenant.timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _local_day_bounds_utc(tenant: Tenant, d: date) -> datetime:
    tz = _tenant_zone(tenant)
    local_midnight = datetime(d.year, d.month, d.day, tzinfo=tz)
    return local_midnight.astimezone(timezone.utc)


def resolve_window(tenant: Tenant, date_from: date, date_to: date, preset: str | None = None) -> AnalyticsWindow:
    if date_to < date_from:
        raise AnalyticsError(422, "date_to must be on or after date_from")
    days = (date_to - date_from).days + 1
    if days > 366:
        raise AnalyticsError(422, "Date range cannot exceed 366 days")
    start_utc = _local_day_bounds_utc(tenant, date_from)
    end_utc = _local_day_bounds_utc(tenant, date_to + timedelta(days=1))
    granularity: Granularity = "day" if days <= 62 else ("week" if days <= 366 else "month")
    return AnalyticsWindow(
        tenant_id=tenant.id, date_from=date_from, date_to=date_to,
        start_utc=start_utc, end_utc=end_utc, days=days, granularity=granularity, preset=preset,
    )


def _window_filter(window: AnalyticsWindow):
    return (
        Invoice.tenant_id == window.tenant_id,
        Invoice.status.in_(_SALE_STATUSES),
        Invoice.created_at >= window.start_utc,
        Invoice.created_at < window.end_utc,
    )


def get_kpis(db: Session, window: AnalyticsWindow) -> DashboardKpis:
    tenant_id = window.tenant_id

    totals = (
        db.query(
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("total_sales"),
            func.count(Invoice.id).label("total_orders"),
            func.coalesce(func.sum(Invoice.discount_amount), 0.0).label("discount_amount"),
            func.coalesce(func.sum(Invoice.tax_amount), 0.0).label("tax_collected"),
            func.coalesce(
                func.sum(case((Invoice.payment_status == "credit", Invoice.total_amount), else_=0.0)), 0.0
            ).label("credit_sales"),
            func.coalesce(
                func.sum(case((Invoice.payment_method == "cash", Invoice.total_amount), else_=0.0)), 0.0
            ).label("cash_sales"),
            func.coalesce(
                func.sum(case((Invoice.payment_method == "card", Invoice.total_amount), else_=0.0)), 0.0
            ).label("card_payments"),
            func.coalesce(
                func.sum(case((Invoice.payment_method == "upi", Invoice.total_amount), else_=0.0)), 0.0
            ).label("upi_payments"),
        )
        .filter(*_window_filter(window))
        .one()
    )

    total_sales = float(totals.total_sales)
    total_orders = int(totals.total_orders)
    average_order_value = total_sales / total_orders if total_orders else 0.0

    returned = (
        db.query(
            func.count(func.distinct(Return.invoice_id)).label("returned_orders"),
            func.coalesce(func.sum(Return.refund_amount), 0.0).label("returned_amount"),
        )
        .filter(
            Return.tenant_id == tenant_id,
            Return.status != "cancelled",
            Return.created_at >= window.start_utc,
            Return.created_at < window.end_utc,
        )
        .one()
    )
    returned_amount = float(returned.returned_amount)

    new_customers = (
        db.query(func.count(Customer.id))
        .filter(
            Customer.tenant_id == tenant_id,
            Customer.created_at >= window.start_utc,
            Customer.created_at < window.end_utc,
        )
        .scalar()
        or 0
    )

    # Running totals "as of now" — deliberately NOT window-scoped, since these represent
    # current state (how many customers/products exist, how much is still owed) rather than
    # a flow of activity within the selected period.
    total_customers = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0
    total_products = (
        db.query(func.count(Product.id))
        .filter(Product.tenant_id == tenant_id, Product.is_active.is_(True))
        .scalar()
        or 0
    )
    outstanding_amount = (
        db.query(func.coalesce(func.sum(Invoice.outstanding_amount), 0.0))
        .filter(Invoice.tenant_id == tenant_id, Invoice.status != "cancelled")
        .scalar()
        or 0.0
    )

    return DashboardKpis(
        total_sales=total_sales,
        # total_amount is already post-discount, so Net Sales subtracts returns only —
        # subtracting discount again would double-count it.
        net_sales=total_sales - returned_amount,
        total_orders=total_orders,
        average_order_value=average_order_value,
        new_customers=int(new_customers),
        credit_sales=float(totals.credit_sales),
        cash_sales=float(totals.cash_sales),
        card_payments=float(totals.card_payments),
        upi_payments=float(totals.upi_payments),
        returned_orders=int(returned.returned_orders),
        returned_amount=returned_amount,
        discount_amount=float(totals.discount_amount),
        tax_collected=float(totals.tax_collected),
        total_customers=int(total_customers),
        total_products=int(total_products),
        outstanding_amount=float(outstanding_amount),
    )


def _daily_series(db: Session, window: AnalyticsWindow) -> dict[date, tuple[float, int]]:
    rows = (
        db.query(
            func.date(Invoice.created_at).label("day"),
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("revenue"),
            func.count(Invoice.id).label("order_count"),
        )
        .filter(*_window_filter(window))
        .group_by(func.date(Invoice.created_at))
        .all()
    )
    result: dict[date, tuple[float, int]] = {}
    for row in rows:
        day = row.day if isinstance(row.day, date) else date.fromisoformat(str(row.day))
        result[day] = (float(row.revenue), int(row.order_count))
    return result


def get_sales_trend(db: Session, window: AnalyticsWindow) -> list[TrendPoint]:
    daily = _daily_series(db, window)
    points: list[TrendPoint] = []

    if window.granularity == "day":
        for offset in range(window.days):
            day = window.date_from + timedelta(days=offset)
            revenue, order_count = daily.get(day, (0.0, 0))
            points.append(TrendPoint(bucket_start=day, bucket_label=day.strftime("%b %d"), revenue=revenue, order_count=order_count))
        return points

    if window.granularity == "week":
        buckets: dict[date, tuple[float, int]] = {}
        order: list[date] = []
        cursor = window.date_from
        while cursor <= window.date_to:
            week_start = cursor - timedelta(days=cursor.weekday())
            if week_start not in buckets:
                buckets[week_start] = (0.0, 0)
                order.append(week_start)
            cursor += timedelta(days=1)
        for day, (revenue, order_count) in daily.items():
            week_start = day - timedelta(days=day.weekday())
            if week_start in buckets:
                rev, cnt = buckets[week_start]
                buckets[week_start] = (rev + revenue, cnt + order_count)
        for week_start in order:
            revenue, order_count = buckets[week_start]
            points.append(
                TrendPoint(
                    bucket_start=week_start,
                    bucket_label=f"Week of {week_start.strftime('%b %d')}",
                    revenue=revenue,
                    order_count=order_count,
                )
            )
        return points

    # month
    month_buckets: dict[date, tuple[float, int]] = {}
    month_order: list[date] = []
    cursor = date(window.date_from.year, window.date_from.month, 1)
    end_month = date(window.date_to.year, window.date_to.month, 1)
    while cursor <= end_month:
        month_buckets[cursor] = (0.0, 0)
        month_order.append(cursor)
        cursor = date(cursor.year + 1, 1, 1) if cursor.month == 12 else date(cursor.year, cursor.month + 1, 1)
    for day, (revenue, order_count) in daily.items():
        month_start = date(day.year, day.month, 1)
        if month_start in month_buckets:
            rev, cnt = month_buckets[month_start]
            month_buckets[month_start] = (rev + revenue, cnt + order_count)
    for month_start in month_order:
        revenue, order_count = month_buckets[month_start]
        points.append(
            TrendPoint(bucket_start=month_start, bucket_label=month_start.strftime("%b %Y"), revenue=revenue, order_count=order_count)
        )
    return points


def get_hourly_sales(db: Session, window: AnalyticsWindow, tenant: Tenant) -> list[HourlyPoint]:
    # Only meaningful for a single tenant-local day — a multi-day range averaged by hour would
    # be misleading, so this widget is simply empty outside that case.
    if window.date_from != window.date_to:
        return []
    tz = _tenant_zone(tenant)
    rows = db.query(Invoice.created_at, Invoice.total_amount).filter(*_window_filter(window)).all()
    buckets: dict[int, list[float]] = {h: [] for h in range(24)}
    for created_at, total_amount in rows:
        aware = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
        buckets[aware.astimezone(tz).hour].append(float(total_amount))
    return [HourlyPoint(hour=h, revenue=sum(amounts), order_count=len(amounts)) for h, amounts in buckets.items()]


def get_payment_methods(db: Session, window: AnalyticsWindow) -> list[PaymentMethodBreakdown]:
    rows = (
        db.query(
            Invoice.payment_method,
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("amount"),
            func.count(Invoice.id).label("count"),
        )
        .filter(*_window_filter(window))
        .group_by(Invoice.payment_method)
        .all()
    )
    return [PaymentMethodBreakdown(method=row.payment_method, amount=float(row.amount), count=row.count) for row in rows]


def get_top_products(db: Session, window: AnalyticsWindow, limit: int = 5) -> list[TopProduct]:
    rows = (
        db.query(
            InvoiceItem.product_id,
            InvoiceItem.product_name,
            InvoiceItem.identifier_value,
            func.sum(InvoiceItem.quantity).label("qty_sold"),
            func.sum(InvoiceItem.line_total).label("revenue"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .filter(*_window_filter(window))
        .group_by(InvoiceItem.product_id, InvoiceItem.product_name, InvoiceItem.identifier_value)
        .order_by(func.sum(InvoiceItem.quantity).desc())
        .limit(limit)
        .all()
    )
    return [
        TopProduct(
            product_id=row.product_id, name=row.product_name, identifier_value=row.identifier_value,
            qty_sold=float(row.qty_sold), revenue=float(row.revenue),
        )
        for row in rows
    ]


def get_top_categories(db: Session, window: AnalyticsWindow, limit: int = 5) -> list[TopCategory]:
    rows = (
        db.query(
            Product.category_id,
            Category.name,
            func.sum(InvoiceItem.quantity).label("qty_sold"),
            func.sum(InvoiceItem.line_total).label("revenue"),
        )
        .select_from(InvoiceItem)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .join(Product, Product.id == InvoiceItem.product_id)
        .outerjoin(Category, Category.id == Product.category_id)
        .filter(*_window_filter(window))
        .group_by(Product.category_id, Category.name)
        .order_by(func.sum(InvoiceItem.line_total).desc())
        .limit(limit)
        .all()
    )
    return [
        TopCategory(category_id=row.category_id, name=row.name or "Uncategorized", qty_sold=float(row.qty_sold), revenue=float(row.revenue))
        for row in rows
    ]


def get_sales_by_employee(db: Session, window: AnalyticsWindow, limit: int = 10) -> list[EmployeeSales]:
    rows = (
        db.query(
            Invoice.created_by,
            User.first_name,
            User.last_name,
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("revenue"),
            func.count(Invoice.id).label("order_count"),
        )
        .join(User, User.id == Invoice.created_by)
        .filter(*_window_filter(window))
        .group_by(Invoice.created_by, User.first_name, User.last_name)
        .order_by(func.sum(Invoice.total_amount).desc())
        .limit(limit)
        .all()
    )
    return [
        EmployeeSales(user_id=row.created_by, name=f"{row.first_name} {row.last_name}".strip(), revenue=float(row.revenue), order_count=int(row.order_count))
        for row in rows
    ]


def get_tax_breakdown(db: Session, window: AnalyticsWindow) -> list[TaxBreakdownRow]:
    rows = (
        db.query(
            InvoiceItem.tax_rate_percent,
            func.sum(InvoiceItem.line_subtotal).label("taxable_amount"),
            func.sum(InvoiceItem.tax_amount).label("tax_amount"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .filter(*_window_filter(window))
        .group_by(InvoiceItem.tax_rate_percent)
        .order_by(InvoiceItem.tax_rate_percent.asc())
        .all()
    )
    return [
        TaxBreakdownRow(tax_rate_percent=float(row.tax_rate_percent), taxable_amount=float(row.taxable_amount), tax_amount=float(row.tax_amount))
        for row in rows
    ]


def get_discount_analysis(db: Session, window: AnalyticsWindow) -> DiscountAnalysis:
    row = (
        db.query(
            func.coalesce(func.sum(Invoice.discount_amount), 0.0).label("total_discount"),
            func.count(func.distinct(case((Invoice.discount_amount > 0, Invoice.id)))).label("discounted_count"),
            func.count(Invoice.id).label("total_count"),
            func.coalesce(func.sum(Invoice.subtotal), 0.0).label("total_subtotal"),
        )
        .filter(*_window_filter(window))
        .one()
    )
    total_discount = float(row.total_discount)
    total_subtotal = float(row.total_subtotal)
    avg_discount_percent = (total_discount / total_subtotal * 100) if total_subtotal else 0.0
    return DiscountAnalysis(
        total_discount=total_discount,
        discounted_invoice_count=int(row.discounted_count),
        total_invoice_count=int(row.total_count),
        avg_discount_percent=avg_discount_percent,
    )


def get_recent_invoices(db: Session, tenant_id: str, limit: int = 10) -> list[RecentInvoice]:
    rows = db.query(Invoice).filter(Invoice.tenant_id == tenant_id).order_by(Invoice.created_at.desc()).limit(limit).all()
    return [
        RecentInvoice(
            id=row.id, invoice_number=row.invoice_number, customer_name=row.customer_name,
            total_amount=row.total_amount, payment_method=row.payment_method, status=row.status,
            created_at=row.created_at,
        )
        for row in rows
    ]


def get_dashboard(db: Session, tenant: Tenant, window: AnalyticsWindow) -> DashboardOut:
    return DashboardOut(
        meta=DateRangeMeta(
            date_from=window.date_from, date_to=window.date_to, days=window.days,
            granularity=window.granularity, preset=window.preset,
        ),
        kpis=get_kpis(db, window),
        sales_trend=get_sales_trend(db, window),
        hourly_sales=get_hourly_sales(db, window, tenant),
        payment_methods=get_payment_methods(db, window),
        top_products=get_top_products(db, window),
        top_categories=get_top_categories(db, window),
        sales_by_employee=get_sales_by_employee(db, window),
        tax_breakdown=get_tax_breakdown(db, window),
        discount_analysis=get_discount_analysis(db, window),
        recent_invoices=get_recent_invoices(db, tenant.id),
    )
