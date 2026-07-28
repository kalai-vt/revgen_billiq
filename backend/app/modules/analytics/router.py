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
from app.modules.analytics import export as export_module
from app.modules.analytics import service
from app.modules.analytics.export import ExportMeta
from app.modules.analytics.service import AnalyticsError
from app.modules.auth.service import get_tenant
from app.modules.settings.service import get_settings

router = APIRouter(prefix="/api", tags=["analytics"])

Widget = Literal[
    "kpis",
    "sales_trend",
    "hourly_sales",
    "payment_methods",
    "top_products",
    "top_categories",
    "sales_by_employee",
    "tax_breakdown",
    "discount_analysis",
    "recent_invoices",
    "customer_retention",
    "cash_flow_summary",
    "full_dashboard",
]


def _resolve(
    db: Session, current_user: User, date_from: date, date_to: date, advanced: bool, preset: str | None
):
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if advanced:
        assert_feature(db, current_user.tenant_id, "advanced_analytics")
    try:
        window = service.resolve_window(tenant, date_from, date_to, preset)
    except AnalyticsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return tenant, window


@router.get("/analytics/dashboard")
def dashboard(
    date_from: date = Query(...),
    date_to: date = Query(...),
    advanced: bool = Query(default=False),
    preset: str | None = Query(default=None, max_length=40),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    tenant, window = _resolve(db, current_user, date_from, date_to, advanced, preset)
    summary = service.get_dashboard(db, tenant, window)
    return make_response(True, "Dashboard analytics generated", summary.model_dump(mode="json"))


@router.get("/analytics/dashboard/export")
def dashboard_export(
    widget: Widget = Query(...),
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    date_from: date = Query(...),
    date_to: date = Query(...),
    advanced: bool = Query(default=False),
    preset: str | None = Query(default=None, max_length=40),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> Response:
    tenant, window = _resolve(db, current_user, date_from, date_to, advanced, preset)

    if widget == "full_dashboard" and format == "csv":
        raise HTTPException(
            status_code=422,
            detail="Whole-dashboard export is not available as CSV; export individual widgets as CSV, or use Excel/PDF for the full report.",
        )

    data = service.get_dashboard(db, tenant, window)
    filter_label = (
        window.date_from.isoformat() if window.date_from == window.date_to else f"{window.date_from.isoformat()} to {window.date_to.isoformat()}"
    )
    settings = get_settings(db, current_user.tenant_id)
    meta = ExportMeta(
        company_name=tenant.company_name,
        logo_url=settings.logo_url if settings else None,
        report_title="Full Dashboard Report" if widget == "full_dashboard" else export_module.WIDGET_SPECS[widget].title,
        filter_label=preset or filter_label,
        generated_at=datetime.now(timezone.utc),
    )

    if widget == "full_dashboard":
        if format == "excel":
            content = export_module.export_full_dashboard_excel(data)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = "dashboard.xlsx"
        else:
            content = export_module.export_full_dashboard_pdf(data, meta)
            media_type = "application/pdf"
            filename = "dashboard.pdf"
    elif format == "excel":
        content = export_module.export_widget_excel(widget, data)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{widget}.xlsx"
    elif format == "csv":
        content = export_module.export_widget_csv(widget, data)
        media_type = "text/csv"
        filename = f"{widget}.csv"
    else:
        content = export_module.export_widget_pdf(widget, data, meta)
        media_type = "application/pdf"
        filename = f"{widget}.pdf"

    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/analytics/trend-comparison")
def trend_comparison(
    unit: service.ComparisonUnit = Query(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    assert_feature(db, current_user.tenant_id, "trend_comparison")
    result = service.get_trend_comparison(db, tenant, unit)
    return make_response(True, "Trend comparison generated", result.model_dump(mode="json"))


@router.get("/analytics/trend-comparison/export")
def trend_comparison_export(
    unit: service.ComparisonUnit = Query(...),
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> Response:
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    assert_feature(db, current_user.tenant_id, "trend_comparison")
    result = service.get_trend_comparison(db, tenant, unit)

    settings = get_settings(db, current_user.tenant_id)
    meta = ExportMeta(
        company_name=tenant.company_name,
        logo_url=settings.logo_url if settings else None,
        report_title="Trend Comparison",
        filter_label=f"{result.current_label} vs {result.previous_label}",
        generated_at=datetime.now(timezone.utc),
    )

    if format == "excel":
        content = export_module.export_trend_comparison_excel(result)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "trend_comparison.xlsx"
    elif format == "csv":
        content = export_module.export_trend_comparison_csv(result)
        media_type = "text/csv"
        filename = "trend_comparison.csv"
    else:
        content = export_module.export_trend_comparison_pdf(result, meta)
        media_type = "application/pdf"
        filename = "trend_comparison.pdf"

    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
