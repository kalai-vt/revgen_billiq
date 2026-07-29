from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.catalog import Product
from app.models.inventory import Inventory
from app.models.procurement import PurchaseEntry, PurchaseEntryItem, PurchaseReturn, Vendor
from app.models.sales import Invoice, InvoiceItem
from app.schemas.procurement_analytics import (
    GstReportRow,
    OutstandingVendorReportRow,
    ProcurementAnalyticsKpis,
    ProcurementAnalyticsOut,
    ProcurementReportsOut,
    ProductAnalysisRow,
    PurchaseReportRow,
    PurchaseReturnReportRow,
    PurchaseTrendPoint,
    VendorAnalysisRow,
    VendorReportRow,
)


def _received_purchases_query(db: Session, tenant_id: str, date_from: date, date_to: date):
    return db.query(PurchaseEntry).filter(
        PurchaseEntry.tenant_id == tenant_id,
        PurchaseEntry.status == "received",
        PurchaseEntry.purchase_date >= date_from,
        PurchaseEntry.purchase_date <= date_to,
    )


def _gross_profit(db: Session, tenant_id: str, date_from: date, date_to: date) -> tuple[float, float]:
    """Approximate gross profit = pre-tax sale revenue minus COGS at *current* product cost price
    (not a historical snapshot — see Phase 1's weighted-average costing note). Directionally
    correct; shifts slightly as later purchases change a product's average cost."""
    rows = (
        db.query(InvoiceItem.line_subtotal, InvoiceItem.quantity, Product.cost_price)
        .join(Invoice, InvoiceItem.invoice_id == Invoice.id)
        .join(Product, InvoiceItem.product_id == Product.id)
        .filter(
            Invoice.tenant_id == tenant_id,
            Invoice.status != "cancelled",
            func.date(Invoice.created_at) >= date_from,
            func.date(Invoice.created_at) <= date_to,
        )
        .all()
    )
    revenue = sum(r[0] for r in rows)
    cogs = sum(r[1] * r[2] for r in rows)
    gross_profit = round(revenue - cogs, 2)
    margin = round((gross_profit / revenue) * 100, 2) if revenue > 0 else 0.0
    return gross_profit, margin


def get_analytics(db: Session, tenant_id: str, date_from: date, date_to: date) -> ProcurementAnalyticsOut:
    purchases = _received_purchases_query(db, tenant_id, date_from, date_to)
    total_purchase_value = purchases.with_entities(func.coalesce(func.sum(PurchaseEntry.total_amount), 0.0)).scalar() or 0.0
    total_purchase_count = purchases.count()

    total_return_value = (
        db.query(func.coalesce(func.sum(PurchaseReturn.refund_amount), 0.0))
        .filter(
            PurchaseReturn.tenant_id == tenant_id,
            PurchaseReturn.status != "cancelled",
            func.date(PurchaseReturn.created_at) >= date_from,
            func.date(PurchaseReturn.created_at) <= date_to,
        )
        .scalar()
        or 0.0
    )

    inventory_value = (
        db.query(func.coalesce(func.sum(Inventory.quantity * Product.cost_price), 0.0))
        .join(Product, Inventory.product_id == Product.id)
        .filter(Inventory.tenant_id == tenant_id, Product.is_active.is_(True))
        .scalar()
        or 0.0
    )

    gross_profit, gross_margin_percent = _gross_profit(db, tenant_id, date_from, date_to)

    trend_rows = (
        _received_purchases_query(db, tenant_id, date_from, date_to)
        .with_entities(PurchaseEntry.purchase_date, func.sum(PurchaseEntry.total_amount), func.count(PurchaseEntry.id))
        .group_by(PurchaseEntry.purchase_date)
        .order_by(PurchaseEntry.purchase_date)
        .all()
    )
    purchase_trend = [
        PurchaseTrendPoint(bucket_label=d.isoformat(), purchase_value=round(v or 0.0, 2), purchase_count=c) for d, v, c in trend_rows
    ]

    vendor_rows = (
        db.query(
            Vendor.id,
            Vendor.name,
            func.sum(PurchaseEntry.total_amount),
            func.count(PurchaseEntry.id),
            Vendor.outstanding_amount,
        )
        .join(PurchaseEntry, PurchaseEntry.vendor_id == Vendor.id)
        .filter(
            PurchaseEntry.tenant_id == tenant_id,
            PurchaseEntry.status == "received",
            PurchaseEntry.purchase_date >= date_from,
            PurchaseEntry.purchase_date <= date_to,
        )
        .group_by(Vendor.id, Vendor.name, Vendor.outstanding_amount)
        .order_by(func.sum(PurchaseEntry.total_amount).desc())
        .all()
    )
    quantity_by_vendor = dict(
        db.query(PurchaseEntry.vendor_id, func.sum(PurchaseEntryItem.quantity))
        .join(PurchaseEntryItem, PurchaseEntryItem.purchase_entry_id == PurchaseEntry.id)
        .filter(
            PurchaseEntry.tenant_id == tenant_id,
            PurchaseEntry.status == "received",
            PurchaseEntry.purchase_date >= date_from,
            PurchaseEntry.purchase_date <= date_to,
        )
        .group_by(PurchaseEntry.vendor_id)
        .all()
    )
    vendor_analysis = [
        VendorAnalysisRow(
            vendor_id=vid,
            vendor_name=name,
            purchase_value=round(value or 0.0, 2),
            purchase_count=count,
            purchase_quantity=round(quantity_by_vendor.get(vid, 0.0), 2),
            outstanding_amount=outstanding,
        )
        for vid, name, value, count, outstanding in vendor_rows
    ]

    product_rows = (
        db.query(
            PurchaseEntryItem.product_id,
            PurchaseEntryItem.product_name,
            func.sum(PurchaseEntryItem.quantity),
            func.sum(PurchaseEntryItem.line_total),
        )
        .join(PurchaseEntry, PurchaseEntryItem.purchase_entry_id == PurchaseEntry.id)
        .filter(
            PurchaseEntry.tenant_id == tenant_id,
            PurchaseEntry.status == "received",
            PurchaseEntry.purchase_date >= date_from,
            PurchaseEntry.purchase_date <= date_to,
        )
        .group_by(PurchaseEntryItem.product_id, PurchaseEntryItem.product_name)
        .order_by(func.sum(PurchaseEntryItem.quantity).desc())
        .limit(10)
        .all()
    )
    product_analysis = [
        ProductAnalysisRow(
            product_id=pid,
            product_name=name,
            quantity_purchased=round(qty or 0.0, 2),
            purchase_value=round(value or 0.0, 2),
            avg_cost_price=round((value or 0.0) / qty, 2) if qty else 0.0,
        )
        for pid, name, qty, value in product_rows
    ]

    return ProcurementAnalyticsOut(
        kpis=ProcurementAnalyticsKpis(
            total_purchase_value=round(total_purchase_value, 2),
            total_purchase_count=total_purchase_count,
            total_return_value=round(total_return_value, 2),
            inventory_value=round(inventory_value, 2),
            gross_profit=gross_profit,
            gross_margin_percent=gross_margin_percent,
        ),
        purchase_trend=purchase_trend,
        vendor_analysis=vendor_analysis,
        product_analysis=product_analysis,
    )


def get_reports(db: Session, tenant_id: str, date_from: date, date_to: date) -> ProcurementReportsOut:
    purchase_rows = (
        db.query(PurchaseEntry, Vendor.name)
        .join(Vendor, PurchaseEntry.vendor_id == Vendor.id)
        .filter(
            PurchaseEntry.tenant_id == tenant_id,
            PurchaseEntry.purchase_date >= date_from,
            PurchaseEntry.purchase_date <= date_to,
        )
        .order_by(PurchaseEntry.purchase_date.desc())
        .all()
    )
    purchase_report = [
        PurchaseReportRow(
            purchase_number=p.purchase_number,
            vendor_name=vendor_name,
            purchase_date=p.purchase_date,
            status=p.status,
            total_amount=p.total_amount,
            payment_status=p.payment_status,
            outstanding_amount=p.outstanding_amount,
        )
        for p, vendor_name in purchase_rows
    ]

    vendor_rows = (
        db.query(
            Vendor.name,
            Vendor.is_active,
            Vendor.outstanding_amount,
            func.count(PurchaseEntry.id),
            func.coalesce(func.sum(PurchaseEntry.total_amount), 0.0),
        )
        .outerjoin(
            PurchaseEntry,
            (PurchaseEntry.vendor_id == Vendor.id)
            & (PurchaseEntry.status == "received")
            & (PurchaseEntry.purchase_date >= date_from)
            & (PurchaseEntry.purchase_date <= date_to),
        )
        .filter(Vendor.tenant_id == tenant_id)
        .group_by(Vendor.id, Vendor.name, Vendor.is_active, Vendor.outstanding_amount)
        .order_by(Vendor.name)
        .all()
    )
    vendor_report = [
        VendorReportRow(vendor_name=name, purchase_count=count, total_purchase_value=round(value, 2), total_outstanding=outstanding, is_active=is_active)
        for name, is_active, outstanding, count, value in vendor_rows
    ]

    outstanding_rows = (
        db.query(Vendor)
        .filter(Vendor.tenant_id == tenant_id, Vendor.outstanding_amount > 0)
        .order_by(Vendor.outstanding_amount.desc())
        .all()
    )
    outstanding_vendor_report = [
        OutstandingVendorReportRow(vendor_name=v.name, outstanding_amount=v.outstanding_amount, credit_limit=v.credit_limit, phone=v.phone)
        for v in outstanding_rows
    ]

    return_rows = (
        db.query(PurchaseReturn, Vendor.name, PurchaseEntry.purchase_number)
        .join(Vendor, PurchaseReturn.vendor_id == Vendor.id)
        .join(PurchaseEntry, PurchaseReturn.purchase_entry_id == PurchaseEntry.id)
        .filter(
            PurchaseReturn.tenant_id == tenant_id,
            func.date(PurchaseReturn.created_at) >= date_from,
            func.date(PurchaseReturn.created_at) <= date_to,
        )
        .order_by(PurchaseReturn.created_at.desc())
        .all()
    )
    purchase_return_report = [
        PurchaseReturnReportRow(
            return_number=r.return_number,
            purchase_number=purchase_number,
            vendor_name=vendor_name,
            status=r.status,
            refund_amount=r.refund_amount,
            created_at=r.created_at,
        )
        for r, vendor_name, purchase_number in return_rows
    ]

    gst_rows = (
        db.query(PurchaseEntryItem.tax_rate_percent, func.sum(PurchaseEntryItem.line_subtotal), func.sum(PurchaseEntryItem.tax_amount))
        .join(PurchaseEntry, PurchaseEntryItem.purchase_entry_id == PurchaseEntry.id)
        .filter(
            PurchaseEntry.tenant_id == tenant_id,
            PurchaseEntry.status == "received",
            PurchaseEntry.purchase_date >= date_from,
            PurchaseEntry.purchase_date <= date_to,
        )
        .group_by(PurchaseEntryItem.tax_rate_percent)
        .order_by(PurchaseEntryItem.tax_rate_percent)
        .all()
    )
    gst_report = [
        GstReportRow(tax_rate_percent=rate, taxable_amount=round(taxable or 0.0, 2), tax_amount=round(tax or 0.0, 2))
        for rate, taxable, tax in gst_rows
    ]

    return ProcurementReportsOut(
        purchase_report=purchase_report,
        vendor_report=vendor_report,
        outstanding_vendor_report=outstanding_vendor_report,
        purchase_return_report=purchase_return_report,
        gst_report=gst_report,
    )
