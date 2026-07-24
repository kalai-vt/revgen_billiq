from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.settings import Settings
from app.models.user import User
from app.modules.auth.service import get_tenant
from app.modules.sales import export as export_module
from app.modules.sales import service
from app.modules.sales.pdf import render_invoice_pdf
from app.modules.sales.service import SalesError
from app.schemas.sales import InvoiceCreate, InvoiceOut, ReturnCreate, ReturnOut

router = APIRouter(prefix="/api", tags=["sales"])


@router.get("/invoices")
def get_invoices(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status: str | None = Query(default=None),
    sort_by: Literal["created_at", "total_amount", "invoice_number"] = Query(default="created_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_invoices(
        db,
        current_user.tenant_id,
        page=page,
        page_size=page_size,
        q=q,
        date_from=date_from,
        date_to=date_to,
        status=status,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return make_response(
        True,
        "Invoices loaded",
        {
            "items": [InvoiceOut.model_validate(i).model_dump(mode="json") for i in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.get("/invoices/export")
def get_invoices_export(
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    q: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status: str | None = Query(default=None),
    sort_by: Literal["created_at", "total_amount", "invoice_number"] = Query(default="created_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> Response:
    items = service.list_invoices_for_export(
        db,
        current_user.tenant_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
        status=status,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    if format == "excel":
        content = export_module.export_invoices_excel(items)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "invoices.xlsx"
    elif format == "csv":
        content = export_module.export_invoices_csv(items)
        media_type = "text/csv"
        filename = "invoices.csv"
    else:
        content = export_module.export_invoices_pdf(items)
        media_type = "application/pdf"
        filename = "invoices.pdf"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/invoices/{invoice_id}")
def get_invoice_detail(
    invoice_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    invoice = service.get_invoice(db, current_user.tenant_id, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return make_response(True, "Invoice loaded", InvoiceOut.model_validate(invoice).model_dump(mode="json"))


@router.post("/invoices")
def post_invoice(
    payload: InvoiceCreate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        invoice = service.create_invoice(db, current_user.tenant_id, current_user, payload)
    except SalesError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Invoice created", InvoiceOut.model_validate(invoice).model_dump(mode="json"))


@router.get("/invoices/{invoice_id}/pdf")
def get_invoice_pdf(
    invoice_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> Response:
    invoice = service.get_invoice(db, current_user.tenant_id, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    settings = db.query(Settings).filter(Settings.tenant_id == current_user.tenant_id).first()
    pdf_bytes = render_invoice_pdf(invoice, tenant, settings)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}.pdf"'},
    )


@router.post("/invoices/{invoice_id}/void")
def post_void_invoice(
    invoice_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    invoice = service.get_invoice(db, current_user.tenant_id, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        invoice = service.void_invoice(db, invoice, current_user)
    except SalesError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Invoice voided", InvoiceOut.model_validate(invoice).model_dump(mode="json"))


@router.get("/returns")
def get_returns(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_returns(db, current_user.tenant_id, page=page, page_size=page_size)
    return make_response(
        True,
        "Returns loaded",
        {
            "items": [ReturnOut.model_validate(r).model_dump(mode="json") for r in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.get("/invoices/{invoice_id}/returns")
def get_invoice_returns(
    invoice_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    invoice = service.get_invoice(db, current_user.tenant_id, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    items = service.list_returns_for_invoice(db, current_user.tenant_id, invoice_id)
    return make_response(True, "Returns loaded", {"items": [ReturnOut.model_validate(r).model_dump(mode="json") for r in items]})


@router.post("/invoices/{invoice_id}/returns")
def post_invoice_return(
    invoice_id: str,
    payload: ReturnCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    invoice = service.get_invoice(db, current_user.tenant_id, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        return_record = service.create_return(db, invoice, current_user, payload)
    except SalesError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Return processed", ReturnOut.model_validate(return_record).model_dump(mode="json"))
