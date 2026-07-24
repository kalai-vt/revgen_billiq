from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.inventory import export as export_module
from app.modules.inventory import import_service
from app.modules.inventory import service
from app.modules.inventory import template as template_module
from app.modules.inventory.import_service import ImportServiceError
from app.modules.inventory.parsers import ParserError
from app.modules.inventory.service import InventoryError
from app.schemas.inventory import ColumnMappingRequest, ImportRowUpdateRequest, StockAdjustRequest

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("/dashboard")
def get_dashboard(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    dashboard = service.get_dashboard(db, current_user.tenant_id)
    return make_response(True, "Inventory dashboard loaded", dashboard.model_dump(mode="json"))


@router.get("")
def get_inventory_list(
    q: str | None = None,
    category_id: str | None = None,
    stock_status: str | None = Query(default=None, pattern="^(low|out)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: Literal["name", "quantity", "cost_price", "selling_price", "updated_at"] = Query(default="name"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_inventory(
        db,
        current_user.tenant_id,
        q=q,
        category_id=category_id,
        stock_status=stock_status,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return make_response(
        True,
        "Inventory loaded",
        {
            "items": [item.model_dump(mode="json") for item in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.get("/export")
def get_inventory_export(
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    q: str | None = None,
    category_id: str | None = None,
    stock_status: str | None = Query(default=None, pattern="^(low|out)$"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> Response:
    items = service.list_inventory_for_export(db, current_user.tenant_id, q=q, category_id=category_id, stock_status=stock_status)
    if format == "excel":
        content = export_module.export_inventory_excel(items)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "inventory.xlsx"
    elif format == "csv":
        content = export_module.export_inventory_csv(items)
        media_type = "text/csv"
        filename = "inventory.csv"
    else:
        content = export_module.export_inventory_pdf(items)
        media_type = "application/pdf"
        filename = "inventory.pdf"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/import-template")
def get_import_template(
    current_user: User = Depends(require_role("owner", "manager")),
) -> Response:
    content = template_module.generate_template_xlsx()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="inventory_import_template.xlsx"'},
    )


@router.post("/{product_id}/adjust")
def post_adjust_stock(
    product_id: str,
    payload: StockAdjustRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        history = service.adjust_stock(db, current_user.tenant_id, product_id, current_user, payload)
    except InventoryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Stock updated", history.model_dump(mode="json"))


@router.get("/stock-history")
def get_stock_history(
    product_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_stock_history(
        db, current_user.tenant_id, product_id=product_id, page=page, page_size=page_size
    )
    return make_response(
        True,
        "Stock history loaded",
        {
            "items": [item.model_dump(mode="json") for item in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.post("/imports")
async def post_import_upload(
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


@router.get("/imports")
def get_import_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    result = import_service.list_import_history(db, current_user.tenant_id, page=page, page_size=page_size)
    return make_response(True, "Import history loaded", result.model_dump(mode="json"))


@router.put("/imports/{import_id}/mapping")
def put_import_mapping(
    import_id: str,
    payload: ColumnMappingRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.confirm_mapping(db, current_user.tenant_id, import_id, payload.mapping)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Mapping applied", result.model_dump(mode="json"))


@router.get("/imports/{import_id}/rows")
def get_import_rows(
    import_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.list_import_rows(db, current_user.tenant_id, import_id)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Import rows loaded", result.model_dump(mode="json"))


@router.patch("/imports/{import_id}/rows/{row_id}")
def patch_import_row(
    import_id: str,
    row_id: str,
    payload: ImportRowUpdateRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.update_import_row(db, current_user.tenant_id, import_id, row_id, payload)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Row updated", result.model_dump(mode="json"))


@router.post("/imports/{import_id}/confirm")
def post_import_confirm(
    import_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.confirm_import(db, current_user.tenant_id, import_id, current_user)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Inventory updated", result.model_dump(mode="json"))


@router.get("/imports/{import_id}/error-report")
def get_import_error_report(
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
