from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.customer import Customer


@dataclass
class ValidatedCustomerRow:
    matched_customer_id: str | None
    name: str | None
    mobile: str | None
    email: str | None
    address: str | None
    status: str
    messages: list[str] = field(default_factory=list)


def _resolve_customer(db: Session, tenant_id: str, mobile: str, email: str) -> Customer | None:
    if mobile:
        customer = db.query(Customer).filter(Customer.tenant_id == tenant_id, Customer.mobile == mobile).first()
        if customer:
            return customer
    if email:
        customer = db.query(Customer).filter(Customer.tenant_id == tenant_id, Customer.email == email).first()
        if customer:
            return customer
    return None


def validate_row(
    db: Session,
    tenant_id: str,
    canonical: dict[str, str],
    seen_identifiers: set[str],
) -> ValidatedCustomerRow:
    """Validate one mapped row against the tenant's customers.

    Upserts: a row matching an existing customer by mobile or email updates it,
    otherwise a new customer is created. Reused verbatim for both the initial
    post-mapping validation pass and the per-row re-validate after a
    preview-grid edit.
    """
    errors: list[str] = []
    warnings: list[str] = []

    name = (canonical.get("name") or "").strip()
    if not name:
        errors.append("Name is required")

    mobile = (canonical.get("mobile") or "").strip()
    email = (canonical.get("email") or "").strip()
    address = (canonical.get("address") or "").strip() or None

    if not mobile and not email:
        warnings.append("No mobile or email provided — customer may be hard to identify later")

    identifier = mobile or email
    if identifier:
        if identifier in seen_identifiers:
            errors.append(f"Duplicate mobile/email '{identifier}' in this file")
        else:
            seen_identifiers.add(identifier)

    customer = _resolve_customer(db, tenant_id, mobile, email)

    status = "error" if errors else ("warning" if warnings else "ready")

    return ValidatedCustomerRow(
        matched_customer_id=customer.id if customer else None,
        name=name or None,
        mobile=mobile or None,
        email=email or None,
        address=address,
        status=status,
        messages=errors + warnings,
    )
