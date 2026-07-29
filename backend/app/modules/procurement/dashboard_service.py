from __future__ import annotations

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.procurement import PurchaseEntry, Vendor
from app.schemas.procurement_dashboard import ProcurementDashboardKpis, ProcurementDashboardOut, TopVendorOut


def get_dashboard(db: Session, tenant_id: str, date_from: date, date_to: date) -> ProcurementDashboardOut:
    today = date.today()
    month_start = today.replace(day=1)

    def sum_for(start: date, end: date) -> float:
        return (
            db.query(func.coalesce(func.sum(PurchaseEntry.total_amount), 0.0))
            .filter(
                PurchaseEntry.tenant_id == tenant_id,
                PurchaseEntry.status == "received",
                PurchaseEntry.purchase_date >= start,
                PurchaseEntry.purchase_date <= end,
            )
            .scalar()
            or 0.0
        )

    range_purchase_count = (
        db.query(func.count(PurchaseEntry.id))
        .filter(
            PurchaseEntry.tenant_id == tenant_id,
            PurchaseEntry.status == "received",
            PurchaseEntry.purchase_date >= date_from,
            PurchaseEntry.purchase_date <= date_to,
        )
        .scalar()
        or 0
    )

    active_vendors_count = (
        db.query(func.count(Vendor.id)).filter(Vendor.tenant_id == tenant_id, Vendor.is_active.is_(True)).scalar() or 0
    )
    outstanding_vendor_payments = (
        db.query(func.coalesce(func.sum(Vendor.outstanding_amount), 0.0)).filter(Vendor.tenant_id == tenant_id).scalar()
        or 0.0
    )

    top_rows = (
        db.query(Vendor.id, Vendor.name, func.sum(PurchaseEntry.total_amount), func.count(PurchaseEntry.id))
        .join(PurchaseEntry, PurchaseEntry.vendor_id == Vendor.id)
        .filter(
            PurchaseEntry.tenant_id == tenant_id,
            PurchaseEntry.status == "received",
            PurchaseEntry.purchase_date >= date_from,
            PurchaseEntry.purchase_date <= date_to,
        )
        .group_by(Vendor.id, Vendor.name)
        .order_by(func.sum(PurchaseEntry.total_amount).desc())
        .limit(5)
        .all()
    )
    top_vendors = [
        TopVendorOut(vendor_id=vid, vendor_name=name, total_amount=round(total or 0.0, 2), purchase_count=count)
        for vid, name, total, count in top_rows
    ]

    return ProcurementDashboardOut(
        kpis=ProcurementDashboardKpis(
            today_purchase_value=round(sum_for(today, today), 2),
            month_purchase_value=round(sum_for(month_start, today), 2),
            range_purchase_value=round(sum_for(date_from, date_to), 2),
            range_purchase_count=range_purchase_count,
            active_vendors_count=active_vendors_count,
            outstanding_vendor_payments=round(outstanding_vendor_payments, 2),
        ),
        top_vendors=top_vendors,
    )
