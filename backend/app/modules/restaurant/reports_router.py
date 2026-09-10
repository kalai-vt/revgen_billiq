from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import require_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.restaurant import reports_service as service

router = APIRouter(
    prefix="/api/restaurant/reports",
    tags=["restaurant-reports"],
    dependencies=[Depends(require_feature("restaurant_reports"))],
)


def _range(start: date | None, end: date | None) -> tuple[date, date]:
    """Defaults to the last 30 days inclusive when the caller gives no range."""
    resolved_end = end or date.today()
    resolved_start = start or (resolved_end - timedelta(days=29))
    return resolved_start, resolved_end


@router.get("/table-sales")
def get_table_sales(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    start, end = _range(start_date, end_date)
    rows = service.table_wise_sales(db, current_user.tenant_id, start, end)
    return make_response(True, "Table sales loaded", {"start_date": str(start), "end_date": str(end), "tables": rows})


@router.get("/kots")
def get_kot_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    start, end = _range(start_date, end_date)
    data = service.kot_report(db, current_user.tenant_id, start, end)
    return make_response(True, "KOT report loaded", {"start_date": str(start), "end_date": str(end), **data})


@router.get("/sales-summary")
def get_sales_summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    start, end = _range(start_date, end_date)
    data = service.restaurant_sales_summary(db, current_user.tenant_id, start, end)
    return make_response(True, "Restaurant sales loaded", {"start_date": str(start), "end_date": str(end), **data})


@router.get("/payments")
def get_payment_report(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    start, end = _range(start_date, end_date)
    data = service.payment_report(db, current_user.tenant_id, start, end)
    return make_response(True, "Payment report loaded", {"start_date": str(start), "end_date": str(end), **data})
