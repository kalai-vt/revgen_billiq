from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.customers.service import get_customer
from app.modules.payments import export as export_module
from app.modules.payments import service
from app.modules.payments.service import PaymentError
from app.schemas.payment import (
    AgeingReportOut,
    CreditSummaryOut,
    CustomerLedgerOut,
    LedgerAdjustmentCreate,
    OutstandingDashboardOut,
    OutstandingInvoiceOut,
    PaymentCreate,
    PaymentOut,
)

router = APIRouter(prefix="/api", tags=["payments"])


@router.post("/payments")
def post_payment(
    payload: PaymentCreate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        payment = service.create_payment(db, current_user.tenant_id, current_user, payload)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Payment recorded", PaymentOut.model_validate(payment).model_dump(mode="json"))


@router.get("/payments")
def get_payments(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    customer_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_payments(
        db, current_user.tenant_id, page=page, page_size=page_size, customer_id=customer_id, date_from=date_from, date_to=date_to
    )
    return make_response(
        True,
        "Payments loaded",
        {
            "items": [PaymentOut.model_validate(p).model_dump(mode="json") for p in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.get("/customers/{customer_id}/outstanding-invoices")
def get_customer_outstanding_invoices(
    customer_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    customer = get_customer(db, current_user.tenant_id, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    items = service.list_outstanding_invoices(db, current_user.tenant_id, customer_id)
    return make_response(
        True, "Outstanding invoices loaded", {"items": [OutstandingInvoiceOut.model_validate(i).model_dump(mode="json") for i in items]}
    )


@router.get("/customers/{customer_id}/credit-summary")
def get_customer_credit_summary(
    customer_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        summary = service.get_credit_summary(db, current_user.tenant_id, customer_id)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Credit summary loaded", CreditSummaryOut.model_validate(summary).model_dump(mode="json"))


@router.get("/customers/{customer_id}/ledger")
def get_customer_ledger_route(
    customer_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        ledger = service.get_customer_ledger(db, current_user.tenant_id, customer_id)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Ledger loaded", CustomerLedgerOut.model_validate(ledger).model_dump(mode="json"))


@router.get("/customers/{customer_id}/ledger/export")
def get_customer_ledger_export(
    customer_id: str,
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> Response:
    try:
        ledger = service.get_customer_ledger(db, current_user.tenant_id, customer_id)
    except PaymentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if format == "excel":
        content = export_module.export_ledger_excel(ledger)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "ledger.xlsx"
    elif format == "csv":
        content = export_module.export_ledger_csv(ledger)
        media_type = "text/csv"
        filename = "ledger.csv"
    else:
        content = export_module.export_ledger_pdf(ledger)
        media_type = "application/pdf"
        filename = "ledger.pdf"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/customers/{customer_id}/ledger/adjustments")
def post_customer_ledger_adjustment(
    customer_id: str,
    payload: LedgerAdjustmentCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    customer = get_customer(db, current_user.tenant_id, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    ledger = service.create_ledger_adjustment(db, current_user.tenant_id, customer, current_user, payload)
    return make_response(True, "Adjustment recorded", CustomerLedgerOut.model_validate(ledger).model_dump(mode="json"))


@router.get("/outstanding/dashboard")
def get_outstanding_dashboard_route(
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    dashboard = service.get_outstanding_dashboard(db, current_user.tenant_id)
    return make_response(True, "Outstanding dashboard loaded", OutstandingDashboardOut.model_validate(dashboard).model_dump(mode="json"))


@router.get("/outstanding/ageing")
def get_ageing_route(
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    report = service.get_ageing_report(db, current_user.tenant_id)
    return make_response(True, "Ageing report loaded", AgeingReportOut.model_validate(report).model_dump(mode="json"))


@router.get("/outstanding/ageing/export")
def get_ageing_export(
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> Response:
    report = service.get_ageing_report(db, current_user.tenant_id)
    if format == "excel":
        content = export_module.export_ageing_excel(report)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "ageing.xlsx"
    elif format == "csv":
        content = export_module.export_ageing_csv(report)
        media_type = "text/csv"
        filename = "ageing.csv"
    else:
        content = export_module.export_ageing_pdf(report)
        media_type = "application/pdf"
        filename = "ageing.pdf"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/outstanding/export")
def get_outstanding_export(
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> Response:
    report = service.get_ageing_report(db, current_user.tenant_id)
    if format == "excel":
        content = export_module.export_outstanding_excel(report.invoices)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "outstanding.xlsx"
    elif format == "csv":
        content = export_module.export_outstanding_csv(report.invoices)
        media_type = "text/csv"
        filename = "outstanding.csv"
    else:
        content = export_module.export_outstanding_pdf(report.invoices)
        media_type = "application/pdf"
        filename = "outstanding.pdf"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})
