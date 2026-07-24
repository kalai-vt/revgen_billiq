from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.catalog import Product, ProductIdentifier


@dataclass
class ValidatedRow:
    matched_product_id: str | None
    matched_product_name: str | None
    quantity: float | None
    cost_price: float | None
    selling_price: float | None
    tax_percent: float | None
    notes: str | None
    status: str
    messages: list[str] = field(default_factory=list)


def _resolve_product(db: Session, tenant_id: str, pid: str, sku: str) -> Product | None:
    identifier_value = pid or sku
    if not identifier_value:
        return None

    product = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.identifier_value == identifier_value)
        .first()
    )
    if product:
        return product

    secondary = (
        db.query(ProductIdentifier)
        .filter(ProductIdentifier.tenant_id == tenant_id, ProductIdentifier.identifier_value == identifier_value)
        .first()
    )
    if secondary:
        return db.get(Product, secondary.product_id)
    return None


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
) -> ValidatedRow:
    """Validate one mapped row against the tenant's catalog and the 8 required rules.

    `canonical` holds raw string values keyed by canonical field name (pid, sku,
    quantity, cost_price, selling_price, tax_percent, notes, ...) — already
    resolved from whatever the user's column mapping says, so this function
    never needs to know about source file headers. Reused verbatim for both
    the initial post-mapping validation pass and the per-row re-validate that
    runs after a user edits a cell in the preview grid.
    """
    errors: list[str] = []
    warnings: list[str] = []

    pid = (canonical.get("pid") or "").strip()
    sku = (canonical.get("sku") or "").strip()
    identifier_value = pid or sku

    product: Product | None = None
    if not identifier_value:
        errors.append("Missing Product ID or SKU")
    else:
        if identifier_value in seen_identifiers:
            errors.append(f"Duplicate identifier '{identifier_value}' in this file")
        else:
            seen_identifiers.add(identifier_value)
        product = _resolve_product(db, tenant_id, pid, sku)
        if product is None:
            errors.append(f"Product not found for '{identifier_value}' — create it in Catalog first")

    quantity_raw = (canonical.get("quantity") or "").strip()
    quantity: float | None = None
    if not quantity_raw:
        errors.append("Quantity is required")
    else:
        quantity = _parse_float(quantity_raw)
        if quantity is None:
            errors.append(f"Invalid quantity '{quantity_raw}'")
        elif quantity < 0:
            errors.append("Quantity cannot be negative")
            quantity = None
        elif quantity == 0:
            warnings.append("Quantity will be set to 0")

    def _parse_optional_price(field_key: str, label: str) -> float | None:
        raw_value = (canonical.get(field_key) or "").strip()
        if not raw_value:
            warnings.append(f"{label} not provided — existing value will be kept")
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

    tax_raw = (canonical.get("tax_percent") or "").strip()
    tax_percent: float | None = None
    if not tax_raw:
        warnings.append("Tax % not provided — existing value will be kept")
    else:
        tax_percent = _parse_float(tax_raw)
        if tax_percent is None:
            errors.append(f"Invalid tax '{tax_raw}'")
        elif not (0 <= tax_percent <= 100):
            errors.append("Tax must be between 0 and 100")
            tax_percent = None

    status = "error" if errors else ("warning" if warnings else "ready")

    return ValidatedRow(
        matched_product_id=product.id if product else None,
        matched_product_name=product.name if product else None,
        quantity=quantity,
        cost_price=cost_price,
        selling_price=selling_price,
        tax_percent=tax_percent,
        notes=(canonical.get("notes") or "").strip() or None,
        status=status,
        messages=errors + warnings,
    )
