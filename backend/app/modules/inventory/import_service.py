from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.notifications import TYPE_IMPORT_COMPLETED, create_notification
from app.core.sanitize import escape_formula
from app.models.catalog import Product
from app.models.inventory import Inventory, InventoryImportHistory, InventoryImportRow
from app.models.user import User
from app.modules.inventory.mapping import auto_map, mapping_is_complete
from app.modules.inventory.parsers import ParserError, get_parser
from app.modules.inventory.service import write_stock_history
from app.modules.inventory.validation_service import validate_row
from app.schemas.inventory import (
    ImportConfirmResponse,
    ImportHistoryListOut,
    ImportHistoryOut,
    ImportRowListOut,
    ImportRowOut,
    ImportRowUpdateRequest,
    ImportUploadResponse,
)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 5000


class ImportServiceError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _get_import(db: Session, tenant_id: str, import_id: str) -> InventoryImportHistory:
    history = (
        db.query(InventoryImportHistory)
        .filter(InventoryImportHistory.tenant_id == tenant_id, InventoryImportHistory.id == import_id)
        .first()
    )
    if not history:
        raise ImportServiceError(404, "Import not found")
    return history


def _canonical_from_row(
    row: InventoryImportRow, mapping: dict[str, str | None], overrides: dict[str, object] | None = None
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
        "pid": raw.get(mapping.get("pid") or "", ""),
        "sku": raw.get(mapping.get("sku") or "", ""),
        "product_name": raw.get(mapping.get("product_name") or "", ""),
        "category": raw.get(mapping.get("category") or "", ""),
        "quantity": value_for("quantity", row.quantity),
        "cost_price": value_for("cost_price", row.cost_price),
        "selling_price": value_for("selling_price", row.selling_price),
        "tax_percent": value_for("tax_percent", row.tax_percent),
        "notes": value_for("notes", row.notes),
    }


async def start_import(
    db: Session, tenant_id: str, current_user: User, filename: str, file_bytes: bytes
) -> ImportUploadResponse:
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

    history = InventoryImportHistory(
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
            InventoryImportRow(
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

    return ImportUploadResponse(
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
    db: Session, tenant_id: str, history: InventoryImportHistory, mapping: dict[str, str | None]
) -> None:
    if not mapping_is_complete(mapping):
        raise ImportServiceError(
            400, "Missing required columns: an identifier (Product ID or SKU) and Quantity must be mapped"
        )

    history.column_mapping = mapping
    db.add(history)
    db.flush()

    rows = (
        db.query(InventoryImportRow)
        .filter(InventoryImportRow.import_id == history.id)
        .order_by(InventoryImportRow.row_number)
        .all()
    )
    seen_identifiers: set[str] = set()
    for row in rows:
        canonical = _canonical_from_row(row, mapping)
        result = validate_row(db, tenant_id, canonical, seen_identifiers)
        row.matched_product_id = result.matched_product_id
        row.quantity = result.quantity
        row.cost_price = result.cost_price
        row.selling_price = result.selling_price
        row.tax_percent = result.tax_percent
        row.notes = result.notes
        row.status = result.status
        row.error_messages = result.messages
        db.add(row)

    history.status = "validated"
    db.add(history)
    db.commit()


def confirm_mapping(
    db: Session, tenant_id: str, import_id: str, mapping: dict[str, str | None]
) -> ImportRowListOut:
    history = _get_import(db, tenant_id, import_id)
    _apply_mapping_and_validate(db, tenant_id, history, mapping)
    return list_import_rows(db, tenant_id, import_id)


def list_import_rows(db: Session, tenant_id: str, import_id: str) -> ImportRowListOut:
    history = _get_import(db, tenant_id, import_id)
    rows = (
        db.query(InventoryImportRow)
        .filter(InventoryImportRow.tenant_id == tenant_id, InventoryImportRow.import_id == import_id)
        .order_by(InventoryImportRow.row_number)
        .all()
    )

    product_ids = [r.matched_product_id for r in rows if r.matched_product_id]
    products: dict[str, Product] = {}
    inventories: dict[str, Inventory] = {}
    if product_ids:
        products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}
        inventories = {
            i.product_id: i for i in db.query(Inventory).filter(Inventory.product_id.in_(product_ids)).all()
        }

    mapping = history.column_mapping or {}
    name_header, pid_header, sku_header = mapping.get("product_name"), mapping.get("pid"), mapping.get("sku")

    items: list[ImportRowOut] = []
    ready = warning = error = skipped = 0
    for row in rows:
        product = products.get(row.matched_product_id) if row.matched_product_id else None
        inv = inventories.get(row.matched_product_id) if row.matched_product_id else None
        raw = row.raw_data or {}
        fallback_name = (
            (name_header and raw.get(name_header))
            or (pid_header and raw.get(pid_header))
            or (sku_header and raw.get(sku_header))
        )
        items.append(
            ImportRowOut(
                id=row.id,
                row_number=row.row_number,
                matched_product_id=row.matched_product_id,
                product_name=product.name if product else (fallback_name or None),
                current_stock=inv.quantity if inv else None,
                quantity=row.quantity,
                cost_price=row.cost_price,
                selling_price=row.selling_price,
                tax_percent=row.tax_percent,
                notes=row.notes,
                status=row.status,
                error_messages=row.error_messages or [],
                is_skipped=row.is_skipped,
            )
        )
        if row.is_skipped:
            skipped += 1
        elif row.status == "ready":
            ready += 1
        elif row.status == "warning":
            warning += 1
        else:
            error += 1

    return ImportRowListOut(
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
    db: Session, tenant_id: str, import_id: str, row_id: str, payload: ImportRowUpdateRequest
) -> ImportRowOut:
    history = _get_import(db, tenant_id, import_id)
    row = (
        db.query(InventoryImportRow)
        .filter(
            InventoryImportRow.tenant_id == tenant_id,
            InventoryImportRow.import_id == import_id,
            InventoryImportRow.id == row_id,
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
            db.query(InventoryImportRow)
            .filter(InventoryImportRow.import_id == import_id, InventoryImportRow.id != row_id)
            .all()
        )
        pid_header, sku_header = mapping.get("pid"), mapping.get("sku")
        seen_identifiers: set[str] = set()
        for other in other_rows:
            raw = other.raw_data or {}
            identifier = (pid_header and raw.get(pid_header)) or (sku_header and raw.get(sku_header))
            if identifier:
                seen_identifiers.add(identifier)

        canonical = _canonical_from_row(row, mapping, overrides=field_overrides)
        result = validate_row(db, tenant_id, canonical, seen_identifiers)
        row.matched_product_id = result.matched_product_id
        row.quantity = result.quantity
        row.cost_price = result.cost_price
        row.selling_price = result.selling_price
        row.tax_percent = result.tax_percent
        row.notes = result.notes
        row.status = result.status
        row.error_messages = result.messages

    db.add(row)
    db.commit()
    db.refresh(row)

    product = db.get(Product, row.matched_product_id) if row.matched_product_id else None
    inv = (
        db.query(Inventory).filter(Inventory.product_id == row.matched_product_id).first()
        if row.matched_product_id
        else None
    )
    return ImportRowOut(
        id=row.id,
        row_number=row.row_number,
        matched_product_id=row.matched_product_id,
        product_name=product.name if product else None,
        current_stock=inv.quantity if inv else None,
        quantity=row.quantity,
        cost_price=row.cost_price,
        selling_price=row.selling_price,
        tax_percent=row.tax_percent,
        notes=row.notes,
        status=row.status,
        error_messages=row.error_messages or [],
        is_skipped=row.is_skipped,
    )


def confirm_import(db: Session, tenant_id: str, import_id: str, current_user: User) -> ImportConfirmResponse:
    history = _get_import(db, tenant_id, import_id)
    if history.status not in ("validated", "partial"):
        raise ImportServiceError(400, "Import must be validated before it can be confirmed")

    rows = (
        db.query(InventoryImportRow)
        .filter(InventoryImportRow.import_id == import_id)
        .order_by(InventoryImportRow.row_number)
        .all()
    )

    imported = failed = skipped = 0
    for row in rows:
        if row.is_skipped:
            skipped += 1
            continue
        if row.status == "error" or not row.matched_product_id or row.quantity is None:
            failed += 1
            continue

        product = db.get(Product, row.matched_product_id)
        inv = db.query(Inventory).filter(Inventory.product_id == row.matched_product_id).first()
        if not product or not inv:
            failed += 1
            continue

        previous_stock = inv.quantity
        new_quantity = row.quantity
        added = max(new_quantity - previous_stock, 0.0)
        removed = max(previous_stock - new_quantity, 0.0)
        inv.quantity = new_quantity
        db.add(inv)

        if row.cost_price is not None:
            product.cost_price = row.cost_price
        if row.selling_price is not None:
            product.selling_price = row.selling_price
        if row.tax_percent is not None:
            product.tax_rate_percent = row.tax_percent
        db.add(product)

        write_stock_history(
            db,
            tenant_id=tenant_id,
            product_id=product.id,
            previous_stock=previous_stock,
            added=added,
            removed=removed,
            current_stock=new_quantity,
            reason="bulk_import",
            source="import",
            created_by=current_user.id,
            notes=row.notes,
            reference_id=row.id,
        )
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
        message=f"Inventory import '{history.file_name}' finished: {imported} imported, {failed} failed, {skipped} skipped.",
        entity_type="InventoryImportHistory",
        entity_id=history.id,
    )

    db.commit()

    return ImportConfirmResponse(
        import_id=import_id, status=history.status, rows_imported=imported, rows_failed=failed, rows_skipped=skipped
    )


def list_import_history(db: Session, tenant_id: str, page: int = 1, page_size: int = 20) -> ImportHistoryListOut:
    query = (
        db.query(InventoryImportHistory, User.first_name, User.last_name)
        .join(User, InventoryImportHistory.imported_by == User.id)
        .filter(InventoryImportHistory.tenant_id == tenant_id)
    )
    total = query.with_entities(func.count(InventoryImportHistory.id)).scalar() or 0
    rows = (
        query.order_by(InventoryImportHistory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        ImportHistoryOut(
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
    return ImportHistoryListOut(items=items, total=total, page=page, page_size=page_size)


def generate_error_report_csv(db: Session, tenant_id: str, import_id: str) -> str:
    _get_import(db, tenant_id, import_id)
    rows = (
        db.query(InventoryImportRow)
        .filter(
            InventoryImportRow.tenant_id == tenant_id,
            InventoryImportRow.import_id == import_id,
            InventoryImportRow.status == "error",
        )
        .order_by(InventoryImportRow.row_number)
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Row", "Errors", "Raw Data"])
    for row in rows:
        # row.raw_data comes straight from the uploaded file — fully attacker-controlled —
        # so every field is formula-escaped individually before it reaches a CSV a tenant
        # will open in Excel (dumping str(dict) alone isn't a reliable defense: it only
        # happens to be safe today because a Python dict repr starts with "{").
        raw_text = "; ".join(f"{escape_formula(key)}={escape_formula(value)}" for key, value in (row.raw_data or {}).items())
        writer.writerow([row.row_number, escape_formula("; ".join(row.error_messages or [])), escape_formula(raw_text)])
    return output.getvalue()
