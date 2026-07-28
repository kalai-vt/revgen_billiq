from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import require_feature
from app.core.responses import make_response
from app.models.user import User
from app.modules.customers import export as export_module
from app.modules.customers import import_service
from app.modules.customers import service
from app.modules.customers import template as template_module
from app.modules.customers.import_service import ImportServiceError
from app.modules.inventory.parsers import ParserError
from app.schemas.customer import (
    CustomerColumnMappingRequest,
    CustomerCreate,
    CustomerImportRowUpdateRequest,
    CustomerOut,
    CustomerUpdate,
)

router = APIRouter(prefix="/api", tags=["customers"], dependencies=[Depends(require_feature("customers"))])


@router.get("/customers")
def get_customers(
    q: str | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: Literal["name", "mobile", "email"] = Query(default="name"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    has_outstanding: bool | None = Query(default=None),
    has_overdue: bool | None = Query(default=None),
    due_today: bool | None = Query(default=None),
    due_this_week: bool | None = Query(default=None),
    credit_enabled: bool | None = Query(default=None),
    credit_limit_exceeded: bool | None = Query(default=None),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_customers(
        db,
        current_user.tenant_id,
        q=q,
        is_active=is_active,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
        has_outstanding=has_outstanding,
        has_overdue=has_overdue,
        due_today=due_today,
        due_this_week=due_this_week,
        credit_enabled=credit_enabled,
        credit_limit_exceeded=credit_limit_exceeded,
    )
    return make_response(
        True,
        "Customers loaded",
        {
            "items": [CustomerOut.model_validate(i).model_dump(mode="json") for i in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.get("/customers/export")
def get_customers_export(
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    q: str | None = None,
    is_active: bool | None = None,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> Response:
    items = service.list_customers_for_export(db, current_user.tenant_id, q=q, is_active=is_active)
    if format == "excel":
        content = export_module.export_customers_excel(items)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "customers.xlsx"
    elif format == "csv":
        content = export_module.export_customers_csv(items)
        media_type = "text/csv"
        filename = "customers.csv"
    else:
        content = export_module.export_customers_pdf(items)
        media_type = "application/pdf"
        filename = "customers.pdf"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/customers")
def post_customer(
    payload: CustomerCreate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    customer = service.create_customer(db, current_user.tenant_id, payload)
    return make_response(True, "Customer created", CustomerOut.model_validate(customer).model_dump(mode="json"))


@router.put("/customers/{customer_id}")
def put_customer(
    customer_id: str,
    payload: CustomerUpdate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    customer = service.get_customer(db, current_user.tenant_id, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer = service.update_customer(db, customer, payload, current_user)
    return make_response(True, "Customer updated", CustomerOut.model_validate(customer).model_dump(mode="json"))


@router.delete("/customers/{customer_id}")
def remove_customer(
    customer_id: str,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    customer = service.get_customer(db, current_user.tenant_id, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    service.delete_customer(db, customer)
    return make_response(True, "Customer deleted", {})


@router.get("/customers/import-template")
def get_customers_import_template(
    current_user: User = Depends(require_role("owner", "manager")),
) -> Response:
    content = template_module.generate_template_xlsx()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="customers_import_template.xlsx"'},
    )


@router.post("/customers/imports")
async def post_customers_import_upload(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    file_bytes = await file.read()
    try:
        result = await import_service.start_import(db, current_user.tenant_id, current_user, file.filename or "upload", file_bytes)
    except (ImportServiceError, ParserError) as exc:
        message = exc.message
        status_code = getattr(exc, "status_code", 400)
        raise HTTPException(status_code=status_code, detail=message) from exc
    return make_response(True, "File uploaded", result.model_dump(mode="json"))


@router.get("/customers/imports")
def get_customers_import_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    result = import_service.list_import_history(db, current_user.tenant_id, page=page, page_size=page_size)
    return make_response(True, "Import history loaded", result.model_dump(mode="json"))


@router.put("/customers/imports/{import_id}/mapping")
def put_customers_import_mapping(
    import_id: str,
    payload: CustomerColumnMappingRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.confirm_mapping(db, current_user.tenant_id, import_id, payload.mapping)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Mapping applied", result.model_dump(mode="json"))


@router.get("/customers/imports/{import_id}/rows")
def get_customers_import_rows(
    import_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.list_import_rows(db, current_user.tenant_id, import_id)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Import rows loaded", result.model_dump(mode="json"))


@router.patch("/customers/imports/{import_id}/rows/{row_id}")
def patch_customers_import_row(
    import_id: str,
    row_id: str,
    payload: CustomerImportRowUpdateRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.update_import_row(db, current_user.tenant_id, import_id, row_id, payload)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Row updated", result.model_dump(mode="json"))


@router.post("/customers/imports/{import_id}/confirm")
def post_customers_import_confirm(
    import_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.confirm_import(db, current_user.tenant_id, import_id, current_user)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Customers updated", result.model_dump(mode="json"))


@router.get("/customers/imports/{import_id}/error-report")
def get_customers_import_error_report(
    import_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> Response:
    try:
        csv_content = import_service.generate_error_report_csv(db, current_user.tenant_id, import_id)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="import_{import_id}_errors.csv"'},
    )


# NOTE: this catch-all-single-segment route must stay LAST among GET /customers/* routes —
# it would otherwise shadow the literal paths above (export, import-template, imports, ...).
@router.get("/customers/{customer_id}")
def get_customer_detail(
    customer_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    customer = service.get_customer(db, current_user.tenant_id, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return make_response(True, "Customer loaded", CustomerOut.model_validate(customer).model_dump(mode="json"))
