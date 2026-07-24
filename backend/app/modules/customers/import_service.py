from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.limits import get_plan_config
from app.core.notifications import TYPE_IMPORT_COMPLETED, create_notification
from app.core.sanitize import escape_formula
from app.models.customer import Customer, CustomerImportHistory, CustomerImportRow
from app.models.user import User
from app.modules.customers.mapping import auto_map, mapping_is_complete
from app.modules.customers.validation_service import validate_row
from app.modules.inventory.parsers import ParserError, get_parser
from app.schemas.customer import (
    CustomerImportConfirmResponse,
    CustomerImportHistoryListOut,
    CustomerImportHistoryOut,
    CustomerImportRowListOut,
    CustomerImportRowOut,
    CustomerImportRowUpdateRequest,
    CustomerImportUploadResponse,
)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 5000


class ImportServiceError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _get_import(db: Session, tenant_id: str, import_id: str) -> CustomerImportHistory:
    history = (
        db.query(CustomerImportHistory)
        .filter(CustomerImportHistory.tenant_id == tenant_id, CustomerImportHistory.id == import_id)
        .first()
    )
    if not history:
        raise ImportServiceError(404, "Import not found")
    return history


def _canonical_from_row(
    row: CustomerImportRow, mapping: dict[str, str | None], overrides: dict[str, object] | None = None
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
        "mobile": value_for("mobile", row.mobile),
        "email": value_for("email", row.email),
        "address": value_for("address", row.address),
    }


async def start_import(
    db: Session, tenant_id: str, current_user: User, filename: str, file_bytes: bytes
) -> CustomerImportUploadResponse:
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

    history = CustomerImportHistory(
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
            CustomerImportRow(
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

    return CustomerImportUploadResponse(
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
    db: Session, tenant_id: str, history: CustomerImportHistory, mapping: dict[str, str | None]
) -> None:
    if not mapping_is_complete(mapping):
        raise ImportServiceError(
            400, "Missing required columns: Name and at least one of Mobile or Email must be mapped"
        )

    history.column_mapping = mapping
    db.add(history)
    db.flush()

    rows = (
        db.query(CustomerImportRow)
        .filter(CustomerImportRow.import_id == history.id)
        .order_by(CustomerImportRow.row_number)
        .all()
    )
    seen_identifiers: set[str] = set()
    for row in rows:
        canonical = _canonical_from_row(row, mapping)
        result = validate_row(db, tenant_id, canonical, seen_identifiers)
        row.matched_customer_id = result.matched_customer_id
        row.name = result.name
        row.mobile = result.mobile
        row.email = result.email
        row.address = result.address
        row.status = result.status
        row.error_messages = result.messages
        db.add(row)

    history.status = "validated"
    db.add(history)
    db.commit()


def confirm_mapping(
    db: Session, tenant_id: str, import_id: str, mapping: dict[str, str | None]
) -> CustomerImportRowListOut:
    history = _get_import(db, tenant_id, import_id)
    _apply_mapping_and_validate(db, tenant_id, history, mapping)
    return list_import_rows(db, tenant_id, import_id)


def _row_out(row: CustomerImportRow) -> CustomerImportRowOut:
    return CustomerImportRowOut(
        id=row.id,
        row_number=row.row_number,
        matched_customer_id=row.matched_customer_id,
        name=row.name,
        mobile=row.mobile,
        email=row.email,
        address=row.address,
        status=row.status,
        error_messages=row.error_messages or [],
        is_skipped=row.is_skipped,
    )


def list_import_rows(db: Session, tenant_id: str, import_id: str) -> CustomerImportRowListOut:
    history = _get_import(db, tenant_id, import_id)
    rows = (
        db.query(CustomerImportRow)
        .filter(CustomerImportRow.tenant_id == tenant_id, CustomerImportRow.import_id == import_id)
        .order_by(CustomerImportRow.row_number)
        .all()
    )

    items: list[CustomerImportRowOut] = []
    ready = warning = error = skipped = 0
    for row in rows:
        items.append(_row_out(row))
        if row.is_skipped:
            skipped += 1
        elif row.status == "ready":
            ready += 1
        elif row.status == "warning":
            warning += 1
        else:
            error += 1

    return CustomerImportRowListOut(
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
    db: Session, tenant_id: str, import_id: str, row_id: str, payload: CustomerImportRowUpdateRequest
) -> CustomerImportRowOut:
    history = _get_import(db, tenant_id, import_id)
    row = (
        db.query(CustomerImportRow)
        .filter(
            CustomerImportRow.tenant_id == tenant_id,
            CustomerImportRow.import_id == import_id,
            CustomerImportRow.id == row_id,
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
            db.query(CustomerImportRow)
            .filter(CustomerImportRow.import_id == import_id, CustomerImportRow.id != row_id)
            .all()
        )
        seen_identifiers: set[str] = {r.mobile or r.email for r in other_rows if r.mobile or r.email}

        canonical = _canonical_from_row(row, mapping, overrides=field_overrides)
        result = validate_row(db, tenant_id, canonical, seen_identifiers)
        row.matched_customer_id = result.matched_customer_id
        row.name = result.name
        row.mobile = result.mobile
        row.email = result.email
        row.address = result.address
        row.status = result.status
        row.error_messages = result.messages

    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_out(row)


def confirm_import(db: Session, tenant_id: str, import_id: str, current_user: User) -> CustomerImportConfirmResponse:
    history = _get_import(db, tenant_id, import_id)
    if history.status not in ("validated", "partial"):
        raise ImportServiceError(400, "Import must be validated before it can be confirmed")

    rows = (
        db.query(CustomerImportRow)
        .filter(CustomerImportRow.import_id == import_id)
        .order_by(CustomerImportRow.row_number)
        .all()
    )

    max_customers = get_plan_config(db, tenant_id)["max_customers"]
    customer_count = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0

    imported = failed = skipped = 0
    for row in rows:
        if row.is_skipped:
            skipped += 1
            continue
        if row.status == "error" or not row.name:
            failed += 1
            continue

        if row.matched_customer_id:
            customer = db.get(Customer, row.matched_customer_id)
            if not customer:
                failed += 1
                continue
            customer.name = row.name
            if row.mobile is not None:
                customer.mobile = row.mobile
            if row.email is not None:
                customer.email = row.email
            if row.address is not None:
                customer.address = row.address
            db.add(customer)
        else:
            if max_customers is not None and customer_count >= max_customers:
                failed += 1
                continue
            customer = Customer(
                tenant_id=tenant_id, name=row.name, mobile=row.mobile, email=row.email, address=row.address
            )
            db.add(customer)
            customer_count += 1

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
        message=f"Customer import '{history.file_name}' finished: {imported} imported, {failed} failed, {skipped} skipped.",
        entity_type="CustomerImportHistory",
        entity_id=history.id,
    )

    db.commit()

    return CustomerImportConfirmResponse(
        import_id=import_id, status=history.status, rows_imported=imported, rows_failed=failed, rows_skipped=skipped
    )


def list_import_history(db: Session, tenant_id: str, page: int = 1, page_size: int = 20) -> CustomerImportHistoryListOut:
    query = (
        db.query(CustomerImportHistory, User.first_name, User.last_name)
        .join(User, CustomerImportHistory.imported_by == User.id)
        .filter(CustomerImportHistory.tenant_id == tenant_id)
    )
    total = query.with_entities(func.count(CustomerImportHistory.id)).scalar() or 0
    rows = (
        query.order_by(CustomerImportHistory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        CustomerImportHistoryOut(
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
    return CustomerImportHistoryListOut(items=items, total=total, page=page, page_size=page_size)


def generate_error_report_csv(db: Session, tenant_id: str, import_id: str) -> str:
    _get_import(db, tenant_id, import_id)
    rows = (
        db.query(CustomerImportRow)
        .filter(
            CustomerImportRow.tenant_id == tenant_id,
            CustomerImportRow.import_id == import_id,
            CustomerImportRow.status == "error",
        )
        .order_by(CustomerImportRow.row_number)
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Row", "Errors", "Raw Data"])
    for row in rows:
        raw_text = "; ".join(f"{escape_formula(key)}={escape_formula(value)}" for key, value in (row.raw_data or {}).items())
        writer.writerow([row.row_number, escape_formula("; ".join(row.error_messages or [])), escape_formula(raw_text)])
    return output.getvalue()
