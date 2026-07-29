from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import require_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.auth.service import get_tenant
from app.modules.commerce import dashboard_service as service
from app.modules.commerce import export as export_module
from app.modules.commerce.export import ExportMeta
from app.modules.settings.service import get_settings

router = APIRouter(
    prefix="/api/commerce", tags=["commerce-dashboard"], dependencies=[Depends(require_feature("commerce_analytics"))]
)

Widget = Literal["kpis", "channel_comparison", "revenue_trend", "top_products", "full_dashboard"]
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/dashboard")
def get_dashboard(
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    data = service.get_dashboard(db, current_user.tenant_id, date_from, date_to)
    return make_response(True, "Commerce dashboard loaded", data.model_dump(mode="json"))


@router.get("/dashboard/export")
def export_dashboard(
    widget: Widget = Query(...),
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> Response:
    if widget == "full_dashboard" and format == "csv":
        raise HTTPException(status_code=422, detail="Full dashboard export is not available as CSV; export individual widgets, or use Excel/PDF.")

    data = service.get_dashboard(db, current_user.tenant_id, date_from, date_to)
    tenant = get_tenant(db, current_user.tenant_id)
    settings = get_settings(db, current_user.tenant_id)
    filter_label = date_from.isoformat() if date_from == date_to else f"{date_from.isoformat()} to {date_to.isoformat()}"
    meta = ExportMeta(
        company_name=tenant.company_name if tenant else "",
        logo_url=settings.logo_url if settings else None,
        report_title="Commerce Analytics" if widget == "full_dashboard" else export_module.WIDGET_SPECS[widget].title,
        filter_label=filter_label,
        generated_at=datetime.now(timezone.utc),
    )

    if widget == "full_dashboard":
        if format == "excel":
            content, media_type, filename = export_module.export_full_dashboard_excel(data), _XLSX, "commerce_analytics.xlsx"
        else:
            content, media_type, filename = export_module.export_full_dashboard_pdf(data, meta), "application/pdf", "commerce_analytics.pdf"
    elif format == "excel":
        content, media_type, filename = export_module.export_widget_excel(widget, data), _XLSX, f"{widget}.xlsx"
    elif format == "csv":
        content, media_type, filename = export_module.export_widget_csv(widget, data), "text/csv", f"{widget}.csv"
    else:
        content, media_type, filename = export_module.export_widget_pdf(widget, data, meta), "application/pdf", f"{widget}.pdf"

    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
