from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.admin_deps import get_current_admin_user
from app.core.db import get_db
from app.models_admin.admin_user import AdminUser
from app.modules.admin_reports import service

router = APIRouter(prefix="/api/admin/reports", tags=["admin-reports"])


def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/customers.csv")
def download_customers_csv(
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> Response:
    return _csv_response(service.customers_csv(db), "customers.csv")


@router.get("/revenue.csv")
def download_revenue_csv(
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> Response:
    return _csv_response(service.revenue_csv(db), "revenue.csv")


@router.get("/payments.csv")
def download_payments_csv(
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> Response:
    return _csv_response(service.payments_csv(db), "payments.csv")
