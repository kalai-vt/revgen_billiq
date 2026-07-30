from __future__ import annotations

import csv
import io
import zipfile
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.blob import UploadValidationError, upload_file
from app.core.security import verify_password
from app.core.timeutils import utc_now
from app.models.catalog import Product
from app.models.customer import Customer
from app.models.sales import Invoice
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.models.token import RefreshToken
from app.models.user import User
from app.schemas.settings import SettingsUpdate

ALLOWED_LOGO_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg"}
MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024


class SettingsError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def get_settings(db: Session, tenant_id: str) -> Settings | None:
    return db.query(Settings).filter(Settings.tenant_id == tenant_id).first()


def save_logo(db: Session, settings: Settings, content: bytes, content_type: str) -> Settings:
    ext = ALLOWED_LOGO_CONTENT_TYPES.get(content_type, "")
    try:
        url = upload_file(
            f"logos/{settings.tenant_id}.{ext}",
            content,
            content_type,
            allowed_content_types=ALLOWED_LOGO_CONTENT_TYPES,
            max_size_bytes=MAX_LOGO_SIZE_BYTES,
        )
    except UploadValidationError as exc:
        raise SettingsError(400, exc.message) from exc

    settings.logo_url = f"{url}?v={int(utc_now().timestamp())}"
    settings.logo_size_bytes = len(content)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def create_default_settings(db: Session, tenant_id: str, currency: str = "INR") -> Settings:
    settings = Settings(tenant_id=tenant_id, currency=currency)
    db.add(settings)
    db.flush()
    return settings


def update_settings(db: Session, settings: Settings, payload: SettingsUpdate) -> Settings:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def _write_csv(zip_file: zipfile.ZipFile, filename: str, header: list[str], rows: list[list[object]]) -> None:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    zip_file.writestr(filename, buffer.getvalue())


def export_tenant_data(db: Session, tenant_id: str) -> bytes:
    """Bundles the tenant's own data into a zip of CSVs — the GDPR-style "export my data" a
    tenant owner can request themselves. Covers the core entities (customers, products, sales,
    team); it isn't literally every row in every table this app has ever written for this tenant
    (procurement, commerce order history, etc. aren't included) — genuinely complete data
    portability across every module is a larger follow-up, this is the honest first cut."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        customers = db.query(Customer).filter(Customer.tenant_id == tenant_id).all()
        _write_csv(
            zip_file,
            "customers.csv",
            ["id", "name", "mobile", "email", "address", "is_active", "credit_limit", "created_at"],
            [[c.id, c.name, c.mobile, c.email, c.address, c.is_active, c.credit_limit, c.created_at] for c in customers],
        )

        products = db.query(Product).filter(Product.tenant_id == tenant_id).all()
        _write_csv(
            zip_file,
            "products.csv",
            ["id", "name", "identifier_value", "barcode", "cost_price", "selling_price", "tax_rate_percent", "is_active", "created_at"],
            [
                [p.id, p.name, p.identifier_value, p.barcode, p.cost_price, p.selling_price, p.tax_rate_percent, p.is_active, p.created_at]
                for p in products
            ],
        )

        invoices = db.query(Invoice).filter(Invoice.tenant_id == tenant_id).all()
        _write_csv(
            zip_file,
            "invoices.csv",
            [
                "id", "invoice_number", "customer_name", "status", "payment_status", "subtotal",
                "tax_amount", "total_amount", "payment_method", "created_at",
            ],
            [
                [
                    i.id, i.invoice_number, i.customer_name, i.status, i.payment_status,
                    i.subtotal, i.tax_amount, i.total_amount, i.payment_method, i.created_at,
                ]
                for i in invoices
            ],
        )

        users = db.query(User).filter(User.tenant_id == tenant_id).all()
        _write_csv(
            zip_file,
            "team.csv",
            ["id", "first_name", "last_name", "email", "role", "status", "created_at"],
            [[u.id, u.first_name, u.last_name, u.email, u.role, u.status, u.created_at] for u in users],
        )

        readme = (
            "This archive contains a CSV export of your RevGen BillIQ account data: customers, "
            "products, invoices, and team members. Generated on "
            f"{datetime.now(timezone.utc).isoformat()}.\n\n"
            "This covers the core records in your account. If you need data from a specific "
            "module not included here (procurement, commerce order history, reports), contact "
            "support and we'll help you get it."
        )
        zip_file.writestr("README.txt", readme)

    return buffer.getvalue()


class AccountDeletionError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def delete_account(db: Session, owner: User, tenant: Tenant, password: str) -> None:
    """Soft-deletes the tenant and immediately revokes every session — the same access-cutoff
    tenant suspension already relies on (`get_current_user` checks `tenant.status`/`is_deleted`
    on every request). This is intentionally NOT an instant hard purge: cascading a real delete
    across every table that references this tenant correctly, safely, and irreversibly is a
    bigger follow-up than this pass — soft-delete plus immediate access loss already satisfies
    "the account is gone" for the owner requesting it, with a support-mediated grace period
    before anything is actually purged, which is a common, defensible pattern for this kind of
    action rather than a silent, unrecoverable delete."""
    if not verify_password(password, owner.password_hash):
        raise AccountDeletionError(401, "Incorrect password")

    tenant.is_deleted = True
    tenant.status = "suspended"
    db.add(tenant)

    db.query(RefreshToken).filter(RefreshToken.user_id.in_(
        db.query(User.id).filter(User.tenant_id == tenant.id)
    ), RefreshToken.revoked.is_(False)).update({"revoked": True}, synchronize_session=False)

    db.query(User).filter(User.tenant_id == tenant.id).update(
        {"session_invalidated_at": utc_now()}, synchronize_session=False
    )
    db.commit()
