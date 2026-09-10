"""Restaurant reporting: table-wise sales, KOT throughput, and dine-in revenue.

Every figure here is derived from the same Table -> Order -> KOT -> Invoice chain the operational
side writes, so a report can always be traced back to the orders behind it. Revenue in particular
comes from the linked Invoice rather than the order's own line maths: the invoice is what actually
carries the discount, tax and rounding the customer paid, so reporting off the order would quietly
disagree with the books.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.restaurant import Kot, RestaurantOrder, RestaurantTable
from app.models.sales import Invoice


def _day_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """Inclusive date range -> half-open datetime range.

    End-of-day is the start of the following day rather than 23:59:59, so an order placed in the
    last second of the range is not silently dropped.
    """
    return (
        datetime.combine(start, time.min, tzinfo=timezone.utc),
        datetime.combine(end, time.max, tzinfo=timezone.utc),
    )


def table_wise_sales(db: Session, tenant_id: str, start: date, end: date) -> list[dict]:
    """Revenue and cover count per table for the period.

    Only billed orders count: an open order has not been paid for and a cancelled one never will
    be, so including either would overstate takings.
    """
    start_at, end_at = _day_bounds(start, end)
    rows = db.execute(
        select(
            RestaurantTable.id,
            RestaurantTable.name,
            func.count(RestaurantOrder.id).label("orders"),
            func.coalesce(func.sum(Invoice.total_amount), 0.0).label("revenue"),
            func.coalesce(func.sum(RestaurantOrder.guest_count), 0).label("guests"),
        )
        .select_from(RestaurantTable)
        .outerjoin(
            RestaurantOrder,
            (RestaurantOrder.table_id == RestaurantTable.id)
            & (RestaurantOrder.status == "billed")
            & (RestaurantOrder.created_at >= start_at)
            & (RestaurantOrder.created_at <= end_at),
        )
        .outerjoin(Invoice, Invoice.id == RestaurantOrder.invoice_id)
        .where(RestaurantTable.tenant_id == tenant_id)
        .group_by(RestaurantTable.id, RestaurantTable.name)
        .order_by(func.coalesce(func.sum(Invoice.total_amount), 0.0).desc())
    ).all()

    return [
        {
            "table_id": row.id,
            "table_name": row.name,
            "orders": int(row.orders or 0),
            "revenue": round(float(row.revenue or 0), 2),
            "guests": int(row.guests or 0),
            # What each sitting was worth is the number that actually drives table-mix decisions;
            # a table with many small orders reads very differently from one with few large ones.
            "average_order_value": round(float(row.revenue or 0) / row.orders, 2) if row.orders else 0.0,
        }
        for row in rows
    ]


def kot_report(db: Session, tenant_id: str, start: date, end: date) -> dict:
    """KOT volume and how tickets ended up, plus average time from fired to served.

    Cancellations are reported separately rather than folded into the total: a high cancel rate is
    an operational signal in its own right, and averaging it into throughput would hide it.
    """
    start_at, end_at = _day_bounds(start, end)
    rows = db.execute(
        select(Kot.status, func.count(Kot.id))
        .where(Kot.tenant_id == tenant_id, Kot.created_at >= start_at, Kot.created_at <= end_at)
        .group_by(Kot.status)
    ).all()
    by_status = {status: int(count) for status, count in rows}

    served = db.execute(
        select(Kot.created_at, Kot.updated_at).where(
            Kot.tenant_id == tenant_id,
            Kot.status == "served",
            Kot.created_at >= start_at,
            Kot.created_at <= end_at,
        )
    ).all()
    # updated_at is when it last moved, which for a served ticket is when it was served. Rows with
    # a missing or backwards timestamp are skipped rather than contributing a negative duration.
    durations = [
        (updated - created).total_seconds() / 60
        for created, updated in served
        if created and updated and updated >= created
    ]

    total = sum(by_status.values())
    cancelled = by_status.get("cancelled", 0)
    return {
        "total_kots": total,
        "by_status": by_status,
        "cancelled": cancelled,
        "cancellation_rate_percent": round(cancelled / total * 100, 2) if total else 0.0,
        "average_minutes_to_serve": round(sum(durations) / len(durations), 1) if durations else None,
    }


def restaurant_sales_summary(db: Session, tenant_id: str, start: date, end: date) -> dict:
    """Dine-in vs takeaway revenue for the period, off the linked invoices."""
    start_at, end_at = _day_bounds(start, end)
    rows = db.execute(
        select(
            RestaurantOrder.order_type,
            func.count(RestaurantOrder.id),
            func.coalesce(func.sum(Invoice.total_amount), 0.0),
        )
        .join(Invoice, Invoice.id == RestaurantOrder.invoice_id)
        .where(
            RestaurantOrder.tenant_id == tenant_id,
            RestaurantOrder.status == "billed",
            RestaurantOrder.created_at >= start_at,
            RestaurantOrder.created_at <= end_at,
        )
        .group_by(RestaurantOrder.order_type)
    ).all()

    by_type = {
        order_type: {"orders": int(count), "revenue": round(float(revenue or 0), 2)}
        for order_type, count, revenue in rows
    }
    total_orders = sum(entry["orders"] for entry in by_type.values())
    total_revenue = round(sum(entry["revenue"] for entry in by_type.values()), 2)
    return {
        "orders": total_orders,
        "revenue": total_revenue,
        "average_order_value": round(total_revenue / total_orders, 2) if total_orders else 0.0,
        "dine_in": by_type.get("dine_in", {"orders": 0, "revenue": 0.0}),
        "takeaway": by_type.get("takeaway", {"orders": 0, "revenue": 0.0}),
    }


def payment_report(db: Session, tenant_id: str, start: date, end: date) -> dict:
    """How restaurant bills were paid, and what is still outstanding.

    UPI is broken out because it is the method the QR flow drives — this is the report that shows
    whether the QR is actually being used.
    """
    start_at, end_at = _day_bounds(start, end)
    rows = db.execute(
        select(
            Invoice.payment_method,
            func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.total_amount), 0.0),
            func.coalesce(func.sum(Invoice.outstanding_amount), 0.0),
        )
        .join(RestaurantOrder, RestaurantOrder.invoice_id == Invoice.id)
        .where(
            RestaurantOrder.tenant_id == tenant_id,
            RestaurantOrder.status == "billed",
            RestaurantOrder.created_at >= start_at,
            RestaurantOrder.created_at <= end_at,
        )
        .group_by(Invoice.payment_method)
    ).all()

    by_method = {
        method: {
            "invoices": int(count),
            "amount": round(float(amount or 0), 2),
            "outstanding": round(float(outstanding or 0), 2),
        }
        for method, count, amount, outstanding in rows
    }
    return {
        "by_method": by_method,
        "total_collected": round(sum(m["amount"] - m["outstanding"] for m in by_method.values()), 2),
        "total_outstanding": round(sum(m["outstanding"] for m in by_method.values()), 2),
        "upi": by_method.get("upi", {"invoices": 0, "amount": 0.0, "outstanding": 0.0}),
    }
