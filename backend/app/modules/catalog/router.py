from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.barcode import generate_ean13
from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.catalog import export as export_module
from app.modules.catalog import import_service
from app.modules.catalog import service
from app.modules.catalog import template as template_module
from app.modules.catalog.import_service import ImportServiceError
from app.modules.catalog.service import CatalogError
from app.modules.inventory.parsers import ParserError
from app.schemas.catalog import (
    DuplicateCheckOut,
    ProductColumnMappingRequest,
    ProductCreate,
    ProductImportRowUpdateRequest,
    ProductMatchOut,
    ProductOut,
    ProductUpdate,
)

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/products/check-duplicate")
def get_check_duplicate(
    name: str | None = None,
    identifier_value: str | None = None,
    barcode: str | None = None,
    exclude_id: str | None = None,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    matches = service.check_duplicate(
        db, current_user.tenant_id, name, identifier_value, barcode, exclude_id=exclude_id
    )
    out = DuplicateCheckOut(
        name_match=ProductMatchOut.model_validate(matches["name_match"]) if matches["name_match"] else None,
        identifier_match=(
            ProductMatchOut.model_validate(matches["identifier_match"]) if matches["identifier_match"] else None
        ),
        barcode_match=ProductMatchOut.model_validate(matches["barcode_match"]) if matches["barcode_match"] else None,
    )
    return make_response(True, "Duplicate check complete", out.model_dump(mode="json"))


@router.get("/catalog/barcode/generate")
def get_generated_barcode(
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    barcode = generate_ean13(db)
    return make_response(True, "Barcode generated", {"barcode": barcode})


@router.get("/products")
def get_products(
    q: str | None = None,
    category_id: str | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: Literal["name", "identifier_value", "cost_price", "selling_price", "tax_rate_percent"] = Query(default="name"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_products(
        db,
        current_user.tenant_id,
        q=q,
        category_id=category_id,
        is_active=is_active,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return make_response(
        True,
        "Products loaded",
        {
            "items": [ProductOut.model_validate(i).model_dump(mode="json") for i in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.get("/products/export")
def get_products_export(
    format: str = Query(pattern="^(excel|pdf|csv)$"),
    q: str | None = None,
    category_id: str | None = None,
    is_active: bool | None = None,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> Response:
    items = service.list_products_for_export(db, current_user.tenant_id, q=q, category_id=category_id, is_active=is_active)
    if format == "excel":
        content = export_module.export_products_excel(items)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "products.xlsx"
    elif format == "csv":
        content = export_module.export_products_csv(items)
        media_type = "text/csv"
        filename = "products.csv"
    else:
        content = export_module.export_products_pdf(items)
        media_type = "application/pdf"
        filename = "products.pdf"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/products")
def post_product(
    payload: ProductCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        product = service.create_product(db, current_user.tenant_id, payload, user_id=current_user.id)
    except CatalogError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Product created", ProductOut.model_validate(product).model_dump(mode="json"))


@router.put("/products/{product_id}")
def put_product(
    product_id: str,
    payload: ProductUpdate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    product = service.get_product(db, current_user.tenant_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        product = service.update_product(db, product, payload, user_id=current_user.id)
    except CatalogError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Product updated", ProductOut.model_validate(product).model_dump(mode="json"))


@router.delete("/products/{product_id}")
def remove_product(
    product_id: str,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    product = service.get_product(db, current_user.tenant_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    service.delete_product(db, product, user_id=current_user.id)
    return make_response(True, "Product deleted", {})


@router.get("/products/import-template")
def get_products_import_template(
    current_user: User = Depends(require_role("owner", "manager")),
) -> Response:
    content = template_module.generate_template_xlsx()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="products_import_template.xlsx"'},
    )


@router.post("/products/imports")
async def post_products_import_upload(
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


@router.get("/products/imports")
def get_products_import_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    result = import_service.list_import_history(db, current_user.tenant_id, page=page, page_size=page_size)
    return make_response(True, "Import history loaded", result.model_dump(mode="json"))


@router.put("/products/imports/{import_id}/mapping")
def put_products_import_mapping(
    import_id: str,
    payload: ProductColumnMappingRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.confirm_mapping(db, current_user.tenant_id, import_id, payload.mapping)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Mapping applied", result.model_dump(mode="json"))


@router.get("/products/imports/{import_id}/rows")
def get_products_import_rows(
    import_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.list_import_rows(db, current_user.tenant_id, import_id)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Import rows loaded", result.model_dump(mode="json"))


@router.patch("/products/imports/{import_id}/rows/{row_id}")
def patch_products_import_row(
    import_id: str,
    row_id: str,
    payload: ProductImportRowUpdateRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.update_import_row(db, current_user.tenant_id, import_id, row_id, payload)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Row updated", result.model_dump(mode="json"))


@router.post("/products/imports/{import_id}/confirm")
def post_products_import_confirm(
    import_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = import_service.confirm_import(db, current_user.tenant_id, import_id, current_user)
    except ImportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Products updated", result.model_dump(mode="json"))


@router.get("/products/imports/{import_id}/error-report")
def get_products_import_error_report(
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
