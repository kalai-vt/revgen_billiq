from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.catalog import Category, Product


@dataclass
class ValidatedProductRow:
    matched_product_id: str | None
    name: str | None
    identifier_value: str | None
    category_id: str | None
    category_name: str | None
    cost_price: float | None
    selling_price: float | None
    tax_rate_percent: float | None
    barcode: str | None
    status: str
    messages: list[str] = field(default_factory=list)


def _resolve_category(db: Session, tenant_id: str, name: str) -> Category | None:
    return (
        db.query(Category)
        .filter(Category.tenant_id == tenant_id, Category.name.ilike(name.strip()))
        .first()
    )


def _resolve_product(db: Session, tenant_id: str, identifier_value: str) -> Product | None:
    return (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.identifier_value == identifier_value)
        .first()
    )


def _parse_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def validate_row(
    db: Session,
    tenant_id: str,
    canonical: dict[str, str],
    seen_identifiers: set[str],
) -> ValidatedProductRow:
    """Validate one mapped row against the tenant's catalog.

    Unlike inventory import (update-only), product import upserts: rows whose
    identifier matches an existing product update it, rows that don't match
    create a new product. Reused verbatim for both the initial post-mapping
    validation pass and the per-row re-validate after a preview-grid edit.
    """
    errors: list[str] = []
    warnings: list[str] = []

    name = (canonical.get("name") or "").strip()
    if not name:
        errors.append("Product name is required")

    identifier_value = (canonical.get("identifier_value") or "").strip()
    product: Product | None = None
    if not identifier_value:
        errors.append("Identifier (PID/SKU) is required")
    else:
        if identifier_value in seen_identifiers:
            errors.append(f"Duplicate identifier '{identifier_value}' in this file")
        else:
            seen_identifiers.add(identifier_value)
        product = _resolve_product(db, tenant_id, identifier_value)

    category_id: str | None = None
    category_name: str | None = None
    category_raw = (canonical.get("category") or "").strip()
    if category_raw:
        category = _resolve_category(db, tenant_id, category_raw)
        if category:
            category_id, category_name = category.id, category.name
        else:
            warnings.append(f"Category '{category_raw}' not found — product will be uncategorized")

    def _parse_optional_price(field_key: str, label: str) -> float | None:
        raw_value = (canonical.get(field_key) or "").strip()
        if not raw_value:
            return None
        parsed = _parse_float(raw_value)
        if parsed is None:
            errors.append(f"Invalid {label.lower()} '{raw_value}'")
            return None
        if parsed < 0:
            errors.append(f"{label} cannot be negative")
            return None
        return parsed

    cost_price = _parse_optional_price("cost_price", "Cost price")
    selling_price = _parse_optional_price("selling_price", "Selling price")

    tax_raw = (canonical.get("tax_rate_percent") or "").strip()
    tax_rate_percent: float | None = None
    if tax_raw:
        tax_rate_percent = _parse_float(tax_raw)
        if tax_rate_percent is None:
            errors.append(f"Invalid tax '{tax_raw}'")
        elif not (0 <= tax_rate_percent <= 100):
            errors.append("Tax must be between 0 and 100")
            tax_rate_percent = None

    barcode = (canonical.get("barcode") or "").strip() or None
    if barcode:
        query = db.query(Product).filter(Product.barcode == barcode)
        if product:
            query = query.filter(Product.id != product.id)
        if query.first():
            errors.append(f"Barcode '{barcode}' is already assigned to another product")

    status = "error" if errors else ("warning" if warnings else "ready")

    return ValidatedProductRow(
        matched_product_id=product.id if product else None,
        name=name or None,
        identifier_value=identifier_value or None,
        category_id=category_id,
        category_name=category_name,
        cost_price=cost_price,
        selling_price=selling_price,
        tax_rate_percent=tax_rate_percent,
        barcode=barcode,
        status=status,
        messages=errors + warnings,
    )
