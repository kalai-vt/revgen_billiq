from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.activity import ACTION_CREATED, ACTION_UPDATED, MODULE_VENDOR, log_activity
from app.models.procurement import PurchaseEntry, Vendor
from app.models.user import User
from app.schemas.vendors import VendorCreate, VendorUpdate

_SORTABLE_FIELDS = {
    "name": Vendor.name,
    "outstanding_amount": Vendor.outstanding_amount,
    "created_at": Vendor.created_at,
}


class VendorError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def list_vendors(
    db: Session,
    tenant_id: str,
    q: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "name",
    sort_dir: str = "asc",
) -> tuple[list[Vendor], int]:
    query = db.query(Vendor).filter(Vendor.tenant_id == tenant_id)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(Vendor.name.ilike(pattern), Vendor.company_name.ilike(pattern), Vendor.phone.ilike(pattern))
        )
    if is_active is not None:
        query = query.filter(Vendor.is_active == is_active)

    total = query.count()
    sort_column = _SORTABLE_FIELDS.get(sort_by, Vendor.name)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    items = query.order_by(order).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def list_vendors_for_picker(db: Session, tenant_id: str) -> list[Vendor]:
    return (
        db.query(Vendor)
        .filter(Vendor.tenant_id == tenant_id, Vendor.is_active.is_(True))
        .order_by(Vendor.name)
        .all()
    )


def get_vendor(db: Session, tenant_id: str, vendor_id: str) -> Vendor | None:
    return db.query(Vendor).filter(Vendor.tenant_id == tenant_id, Vendor.id == vendor_id).first()


def create_vendor(db: Session, tenant_id: str, current_user: User, payload: VendorCreate) -> Vendor:
    vendor = Vendor(tenant_id=tenant_id, **payload.model_dump())
    db.add(vendor)
    db.flush()
    log_activity(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        module=MODULE_VENDOR,
        action=ACTION_CREATED,
        description=f"Created vendor '{vendor.name}'",
        entity_type="Vendor",
        entity_id=vendor.id,
    )
    db.commit()
    db.refresh(vendor)
    return vendor


def update_vendor(db: Session, vendor: Vendor, current_user: User, payload: VendorUpdate) -> Vendor:
    changed_fields = payload.model_dump(exclude_unset=True)
    for field, value in changed_fields.items():
        setattr(vendor, field, value)
    db.add(vendor)
    if changed_fields:
        log_activity(
            db,
            tenant_id=vendor.tenant_id,
            user_id=current_user.id,
            module=MODULE_VENDOR,
            action=ACTION_UPDATED,
            description=f"Updated vendor '{vendor.name}'",
            entity_type="Vendor",
            entity_id=vendor.id,
        )
    db.commit()
    db.refresh(vendor)
    return vendor


def delete_vendor(db: Session, vendor: Vendor) -> None:
    has_purchases = (
        db.query(PurchaseEntry.id)
        .filter(PurchaseEntry.tenant_id == vendor.tenant_id, PurchaseEntry.vendor_id == vendor.id)
        .first()
        is not None
    )
    if has_purchases:
        raise VendorError(400, "This vendor has purchase history and can't be deleted — deactivate it instead.")
    db.delete(vendor)
    db.commit()
