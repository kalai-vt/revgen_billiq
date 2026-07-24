from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.limits import get_plan_config
from app.core.notifications import TYPE_IMPORT_COMPLETED, create_notification
from app.core.sanitize import escape_formula
from app.models.catalog import Category, Product, ProductImportHistory, ProductImportRow
from app.models.inventory import Inventory
from app.models.settings import Settings
from app.models.user import User
from app.modules.catalog.mapping import auto_map, mapping_is_complete
from app.modules.catalog.validation_service import validate_row
from app.modules.inventory.parsers import ParserError, get_parser
from app.schemas.catalog import (
    ProductImportConfirmResponse,
    ProductImportHistoryListOut,
    ProductImportHistoryOut,
    ProductImportRowListOut,
    ProductImportRowOut,
    ProductImportRowUpdateRequest,
    ProductImportUploadResponse,
)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 5000


class ImportServiceError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _get_import(db: Session, tenant_id: str, import_id: str) -> ProductImportHistory:
    history = (
        db.query(ProductImportHistory)
        .filter(ProductImportHistory.tenant_id == tenant_id, ProductImportHistory.id == import_id)
        .first()
    )
    if not history:
        raise ImportServiceError(404, "Import not found")
    return history


def _canonical_from_row(
    row: ProductImportRow, mapping: dict[str, str | None], overrides: dict[str, object] | None = None
) -> dict[str, str]:
    overrides = overrides or {}
    raw = row.raw_data or {}

    def value_for(field: str, current_value: object) -> str:
        if field in overrides:
            value = overrides[field]
            return "" if value is None else str(value)
        if current_value is not None:
            return str(current_value)
        header = mapping.get(field)
        return raw.get(header, "") if header else ""

    return {
        "name": value_for("name", row.name),
        "identifier_value": value_for("identifier_value", row.identifier_value),
        "category": raw.get(mapping.get("category") or "", ""),
        "cost_price": value_for("cost_price", row.cost_price),
        "selling_price": value_for("selling_price", row.selling_price),
        "tax_rate_percent": value_for("tax_rate_percent", row.tax_rate_percent),
        "barcode": value_for("barcode", row.barcode),
    }


async def start_import(
    db: Session, tenant_id: str, current_user: User, filename: str, file_bytes: bytes
) -> ProductImportUploadResponse:
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise ImportServiceError(400, "File is too large (max 5MB)")

    parser, source_type = get_parser(filename)
    try:
        rows = await parser.parse(file_bytes, filename)
    except ParserError as exc:
        raise ImportServiceError(400, exc.message) from exc

    if not rows:
        raise ImportServiceError(400, "The uploaded file has no data rows")
    if len(rows) > MAX_ROWS:
        raise ImportServiceError(400, f"File has too many rows (max {MAX_ROWS})")

    headers: list[str] = []
    seen_headers: set[str] = set()
    for row in rows:
        for header in row.raw.keys():
            if header not in seen_headers:
                seen_headers.add(header)
                headers.append(header)

    mapping = auto_map(headers)
    requires_mapping = not mapping_is_complete(mapping)

    history = ProductImportHistory(
        tenant_id=tenant_id,
        file_name=filename,
        source_type=source_type,
        status="mapping_required" if requires_mapping else "uploaded",
        rows_total=len(rows),
        imported_by=current_user.id,
    )
    db.add(history)
    db.flush()

    for row_number, row in enumerate(rows, start=1):
        db.add(
            ProductImportRow(
                tenant_id=tenant_id,
                import_id=history.id,
                row_number=row_number,
                raw_data=row.raw,
                status="ready",
                is_skipped=False,
            )
        )
    db.commit()

    if not requires_mapping:
        _apply_mapping_and_validate(db, tenant_id, history, mapping)

    return ProductImportUploadResponse(
        import_id=history.id,
        file_name=filename,
        source_type=source_type,
        status=history.status,
        rows_total=len(rows),
        detected_headers=headers,
        auto_mapping=mapping,
        requires_mapping=requires_mapping,
    )


def _apply_mapping_and_validate(
    db: Session, tenant_id: str, history: ProductImportHistory, mapping: dict[str, str | None]
) -> None:
    if not mapping_is_complete(mapping):
        raise ImportServiceError(400, "Missing required columns: Product Name and Identifier must be mapped")

    history.column_mapping = mapping
    db.add(history)
    db.flush()

    rows = (
        db.query(ProductImportRow)
        .filter(ProductImportRow.import_id == history.id)
        .order_by(ProductImportRow.row_number)
        .all()
    )
    seen_identifiers: set[str] = set()
    for row in rows:
        canonical = _canonical_from_row(row, mapping)
        result = validate_row(db, tenant_id, canonical, seen_identifiers)
        row.matched_product_id = result.matched_product_id
        row.name = result.name
        row.identifier_value = result.identifier_value
        row.category_id = result.category_id
        row.cost_price = result.cost_price
        row.selling_price = result.selling_price
        row.tax_rate_percent = result.tax_rate_percent
        row.barcode = result.barcode
        row.status = result.status
        row.error_messages = result.messages
        db.add(row)

    history.status = "validated"
    db.add(history)
    db.commit()


def confirm_mapping(
    db: Session, tenant_id: str, import_id: str, mapping: dict[str, str | None]
) -> ProductImportRowListOut:
    history = _get_import(db, tenant_id, import_id)
    _apply_mapping_and_validate(db, tenant_id, history, mapping)
    return list_import_rows(db, tenant_id, import_id)


def _row_out(row: ProductImportRow, products: dict[str, Product], categories: dict[str, Category]) -> ProductImportRowOut:
    product = products.get(row.matched_product_id) if row.matched_product_id else None
    category = categories.get(row.category_id) if row.category_id else None
    return ProductImportRowOut(
        id=row.id,
        row_number=row.row_number,
        matched_product_id=row.matched_product_id,
        name=row.name or (product.name if product else None),
        identifier_value=row.identifier_value,
        category_name=category.name if category else None,
        cost_price=row.cost_price,
        selling_price=row.selling_price,
        tax_rate_percent=row.tax_rate_percent,
        barcode=row.barcode,
        status=row.status,
        error_messages=row.error_messages or [],
        is_skipped=row.is_skipped,
    )


def list_import_rows(db: Session, tenant_id: str, import_id: str) -> ProductImportRowListOut:
    history = _get_import(db, tenant_id, import_id)
    rows = (
        db.query(ProductImportRow)
        .filter(ProductImportRow.tenant_id == tenant_id, ProductImportRow.import_id == import_id)
        .order_by(ProductImportRow.row_number)
        .all()
    )

    product_ids = [r.matched_product_id for r in rows if r.matched_product_id]
    category_ids = [r.category_id for r in rows if r.category_id]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    categories = (
        {c.id: c for c in db.query(Category).filter(Category.id.in_(category_ids)).all()} if category_ids else {}
    )

    items: list[ProductImportRowOut] = []
    ready = warning = error = skipped = 0
    for row in rows:
        items.append(_row_out(row, products, categories))
        if row.is_skipped:
            skipped += 1
        elif row.status == "ready":
            ready += 1
        elif row.status == "warning":
            warning += 1
        else:
            error += 1

    return ProductImportRowListOut(
        import_id=import_id,
        status=history.status,
        items=items,
        total=len(items),
        ready_count=ready,
        warning_count=warning,
        error_count=error,
        skipped_count=skipped,
    )


def update_import_row(
    db: Session, tenant_id: str, import_id: str, row_id: str, payload: ProductImportRowUpdateRequest
) -> ProductImportRowOut:
    history = _get_import(db, tenant_id, import_id)
    row = (
        db.query(ProductImportRow)
        .filter(
            ProductImportRow.tenant_id == tenant_id,
            ProductImportRow.import_id == import_id,
            ProductImportRow.id == row_id,
        )
        .first()
    )
    if not row:
        raise ImportServiceError(404, "Row not found")

    mapping = history.column_mapping or {}
    updates = payload.model_dump(exclude_unset=True)
    if "is_skipped" in updates:
        row.is_skipped = bool(updates["is_skipped"])

    field_overrides = {k: v for k, v in updates.items() if k != "is_skipped"}
    if field_overrides:
        other_rows = (
            db.query(ProductImportRow)
            .filter(ProductImportRow.import_id == import_id, ProductImportRow.id != row_id)
            .all()
        )
        seen_identifiers: set[str] = {r.identifier_value for r in other_rows if r.identifier_value}

        canonical = _canonical_from_row(row, mapping, overrides=field_overrides)
        result = validate_row(db, tenant_id, canonical, seen_identifiers)
        row.matched_product_id = result.matched_product_id
        row.name = result.name
        row.identifier_value = result.identifier_value
        row.category_id = result.category_id
        row.cost_price = result.cost_price
        row.selling_price = result.selling_price
        row.tax_rate_percent = result.tax_rate_percent
        row.barcode = result.barcode
        row.status = result.status
        row.error_messages = result.messages

    db.add(row)
    db.commit()
    db.refresh(row)

    product = db.get(Product, row.matched_product_id) if row.matched_product_id else None
    category = db.get(Category, row.category_id) if row.category_id else None
    return _row_out(row, {product.id: product} if product else {}, {category.id: category} if category else {})


def confirm_import(db: Session, tenant_id: str, import_id: str, current_user: User) -> ProductImportConfirmResponse:
    history = _get_import(db, tenant_id, import_id)
    if history.status not in ("validated", "partial"):
        raise ImportServiceError(400, "Import must be validated before it can be confirmed")

    rows = (
        db.query(ProductImportRow)
        .filter(ProductImportRow.import_id == import_id)
        .order_by(ProductImportRow.row_number)
        .all()
    )

    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    reorder_level = settings.default_low_stock_threshold if settings else 5.0
    max_products = get_plan_config(db, tenant_id)["max_products"]
    product_count = db.query(func.count(Product.id)).filter(Product.tenant_id == tenant_id).scalar() or 0

    imported = failed = skipped = 0
    for row in rows:
        if row.is_skipped:
            skipped += 1
            continue
        if row.status == "error" or not row.name or not row.identifier_value:
            failed += 1
            continue

        if row.matched_product_id:
            product = db.get(Product, row.matched_product_id)
            if not product:
                failed += 1
                continue
            product.name = row.name
            if row.category_id is not None:
                product.category_id = row.category_id
            if row.cost_price is not None:
                product.cost_price = row.cost_price
            if row.selling_price is not None:
                product.selling_price = row.selling_price
            if row.tax_rate_percent is not None:
                product.tax_rate_percent = row.tax_rate_percent
            if row.barcode is not None:
                product.barcode = row.barcode
            db.add(product)
        else:
            if max_products is not None and product_count >= max_products:
                failed += 1
                continue
            product = Product(
                tenant_id=tenant_id,
                category_id=row.category_id,
                name=row.name,
                identifier_value=row.identifier_value,
                barcode=row.barcode,
                cost_price=row.cost_price or 0.0,
                selling_price=row.selling_price or 0.0,
                tax_rate_percent=row.tax_rate_percent or 0.0,
            )
            db.add(product)
            db.flush()
            db.add(Inventory(tenant_id=tenant_id, product_id=product.id, quantity=0.0, reorder_level=reorder_level))
            product_count += 1

        imported += 1

    history.rows_imported = imported
    history.rows_failed = failed
    history.status = "completed" if failed == 0 else "partial"
    history.completed_at = datetime.now(timezone.utc)
    db.add(history)

    create_notification(
        db,
        tenant_id=tenant_id,
        type=TYPE_IMPORT_COMPLETED,
        title="Import completed",
        message=f"Product import '{history.file_name}' finished: {imported} imported, {failed} failed, {skipped} skipped.",
        entity_type="ProductImportHistory",
        entity_id=history.id,
    )

    db.commit()

    return ProductImportConfirmResponse(
        import_id=import_id, status=history.status, rows_imported=imported, rows_failed=failed, rows_skipped=skipped
    )


def list_import_history(db: Session, tenant_id: str, page: int = 1, page_size: int = 20) -> ProductImportHistoryListOut:
    query = (
        db.query(ProductImportHistory, User.first_name, User.last_name)
        .join(User, ProductImportHistory.imported_by == User.id)
        .filter(ProductImportHistory.tenant_id == tenant_id)
    )
    total = query.with_entities(func.count(ProductImportHistory.id)).scalar() or 0
    rows = (
        query.order_by(ProductImportHistory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        ProductImportHistoryOut(
            id=history.id,
            file_name=history.file_name,
            source_type=history.source_type,
            status=history.status,
            rows_total=history.rows_total,
            rows_imported=history.rows_imported,
            rows_failed=history.rows_failed,
            imported_by=history.imported_by,
            imported_by_name=f"{first_name} {last_name}",
            created_at=history.created_at,
            completed_at=history.completed_at,
        )
        for history, first_name, last_name in rows
    ]
    return ProductImportHistoryListOut(items=items, total=total, page=page, page_size=page_size)


def generate_error_report_csv(db: Session, tenant_id: str, import_id: str) -> str:
    _get_import(db, tenant_id, import_id)
    rows = (
        db.query(ProductImportRow)
        .filter(
            ProductImportRow.tenant_id == tenant_id,
            ProductImportRow.import_id == import_id,
            ProductImportRow.status == "error",
        )
        .order_by(ProductImportRow.row_number)
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Row", "Errors", "Raw Data"])
    for row in rows:
        raw_text = "; ".join(f"{escape_formula(key)}={escape_formula(value)}" for key, value in (row.raw_data or {}).items())
        writer.writerow([row.row_number, escape_formula("; ".join(row.error_messages or [])), escape_formula(raw_text)])
    return output.getvalue()
