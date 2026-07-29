from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import assert_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.auth.service import get_tenant
from app.modules.procurement import analytics_service as service
from app.modules.procurement import export as export_module
from app.modules.procurement.export import ExportMeta
from app.modules.settings.service import get_settings

router = APIRouter(prefix="/api/procurement", tags=["procurement-analytics"])

_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

AnalyticsWidget = Literal["kpis", "purchase_trend", "vendor_analysis", "product_analysis", "full_analytics"]
ReportWidget = Literal["purchase_report", "vendor_report", "outstanding_vendor_report", "purchase_return_report", "gst_report", "full_reports"]


def _filter_label(date_from: date, date_to: date) -> str:
    return date_from.isoformat() if date_from == date_to else f"{date_from.isoformat()} to {date_to.isoformat()}"


def _build_meta(db: Session, current_user: User, date_from: date, date_to: date, report_title: str) -> ExportMeta:
    tenant = get_tenant(db, current_user.tenant_id)
    settings = get_settings(db, current_user.tenant_id)
    return ExportMeta(
        company_name=tenant.company_name if tenant else "",
        logo_url=settings.logo_url if settings else None,
        report_title=report_title,
        filter_label=_filter_label(date_from, date_to),
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/analytics")
def get_analytics(
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    assert_feature(db, current_user.tenant_id, "procurement_analytics")
    data = service.get_analytics(db, current_user.tenant_id, date_from, date_to)
    return make_response(True, "Procurement analytics loaded", data.model_dump(mode="json"))


@router.get("/analytics/export")
def export_analytics(
    widget: AnalyticsWidget = Query(...),
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> Response:
    assert_feature(db, current_user.tenant_id, "procurement_analytics")
    if widget == "full_analytics" and format == "csv":
        raise HTTPException(status_code=422, detail="Full analytics export is not available as CSV; export individual widgets, or use Excel/PDF.")

    data = service.get_analytics(db, current_user.tenant_id, date_from, date_to)
    title = "Procurement Analytics" if widget == "full_analytics" else export_module.ANALYTICS_WIDGET_SPECS[widget].title
    meta = _build_meta(db, current_user, date_from, date_to, title)

    if widget == "full_analytics":
        if format == "excel":
            content, media_type, filename = export_module.export_full_analytics_excel(data), _XLSX, "procurement_analytics.xlsx"
        else:
            content, media_type, filename = export_module.export_full_analytics_pdf(data, meta), "application/pdf", "procurement_analytics.pdf"
    elif format == "excel":
        content, media_type, filename = export_module.export_widget_excel(widget, data), _XLSX, f"{widget}.xlsx"
    elif format == "csv":
        content, media_type, filename = export_module.export_widget_csv(widget, data), "text/csv", f"{widget}.csv"
    else:
        content, media_type, filename = export_module.export_widget_pdf(widget, data, meta), "application/pdf", f"{widget}.pdf"

    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/reports")
def get_reports(
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    assert_feature(db, current_user.tenant_id, "procurement_reports")
    data = service.get_reports(db, current_user.tenant_id, date_from, date_to)
    return make_response(True, "Procurement reports loaded", data.model_dump(mode="json"))


@router.get("/reports/export")
def export_reports(
    widget: ReportWidget = Query(...),
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> Response:
    assert_feature(db, current_user.tenant_id, "procurement_reports")
    if widget == "full_reports" and format == "csv":
        raise HTTPException(status_code=422, detail="Full reports export is not available as CSV; export individual reports, or use Excel/PDF.")

    data = service.get_reports(db, current_user.tenant_id, date_from, date_to)
    title = "Procurement Reports" if widget == "full_reports" else export_module.REPORT_WIDGET_SPECS[widget].title
    meta = _build_meta(db, current_user, date_from, date_to, title)

    if widget == "full_reports":
        if format == "excel":
            content, media_type, filename = export_module.export_full_reports_excel(data), _XLSX, "procurement_reports.xlsx"
        else:
            content, media_type, filename = export_module.export_full_reports_pdf(data, meta), "application/pdf", "procurement_reports.pdf"
    elif format == "excel":
        content, media_type, filename = export_module.export_widget_excel(widget, data), _XLSX, f"{widget}.xlsx"
    elif format == "csv":
        content, media_type, filename = export_module.export_widget_csv(widget, data), "text/csv", f"{widget}.csv"
    else:
        content, media_type, filename = export_module.export_widget_pdf(widget, data, meta), "application/pdf", f"{widget}.pdf"

    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
