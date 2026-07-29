from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.activity import ACTION_CANCELLED, ACTION_CONFIRMED, ACTION_CREATED, MODULE_PURCHASE, log_activity
from app.models.catalog import Product
from app.models.inventory import Inventory
from app.models.procurement import PurchaseEntry, PurchaseEntryItem, Vendor
from app.models.user import User
from app.modules.inventory.service import write_stock_history
from app.schemas.purchases import PurchaseEntryCreate, PurchaseEntryItemOut, PurchaseEntryListItemOut, PurchaseEntryOut

_SORTABLE_FIELDS = {
    "purchase_date": PurchaseEntry.purchase_date,
    "total_amount": PurchaseEntry.total_amount,
    "created_at": PurchaseEntry.created_at,
}

_IMMEDIATE_PAYMENT_MODES = {"cash", "card", "upi"}


class PurchaseError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _next_purchase_number(db: Session, tenant_id: str) -> str:
    count = db.query(func.count(PurchaseEntry.id)).filter(PurchaseEntry.tenant_id == tenant_id).scalar() or 0
    year = datetime.now(timezone.utc).year
    return f"PUR-{year}-{count + 1:06d}"


def _apply_receipt_effects(db: Session, tenant_id: str, purchase: PurchaseEntry, current_user: User) -> None:
    """Increases stock and recomputes weighted-average cost price for every line item, writing
    the standard StockHistory audit trail entry per line (reason="purchase"). Called exactly once
    per purchase, either immediately on create (status="received") or later via confirm()."""
    for item in purchase.items:
        inv = (
            db.query(Inventory)
            .filter(Inventory.tenant_id == tenant_id, Inventory.product_id == item.product_id)
            .first()
        )
        if inv is None:
            continue

        previous_stock = inv.quantity
        new_stock = previous_stock + item.quantity
        inv.quantity = new_stock
        db.add(inv)

        product = db.get(Product, item.product_id)
        if product is not None:
            denom = previous_stock + item.quantity
            if denom > 0:
                product.cost_price = round(
                    ((previous_stock * product.cost_price) + (item.quantity * item.unit_cost_price)) / denom, 4
                )
            else:
                product.cost_price = item.unit_cost_price
            db.add(product)

        write_stock_history(
            db,
            tenant_id=tenant_id,
            product_id=item.product_id,
            previous_stock=previous_stock,
            added=item.quantity,
            removed=0.0,
            current_stock=new_stock,
            reason="purchase",
            source="system",
            created_by=current_user.id,
            reference_id=purchase.id,
        )


def list_purchase_entries(
    db: Session,
    tenant_id: str,
    q: str | None = None,
    vendor_id: str | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
) -> tuple[list[PurchaseEntryListItemOut], int]:
    query = (
        db.query(PurchaseEntry, Vendor.name)
        .join(Vendor, PurchaseEntry.vendor_id == Vendor.id)
        .filter(PurchaseEntry.tenant_id == tenant_id)
    )
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                PurchaseEntry.purchase_number.ilike(pattern),
                PurchaseEntry.vendor_invoice_number.ilike(pattern),
                Vendor.name.ilike(pattern),
            )
        )
    if vendor_id:
        query = query.filter(PurchaseEntry.vendor_id == vendor_id)
    if status:
        query = query.filter(PurchaseEntry.status == status)
    if date_from:
        query = query.filter(PurchaseEntry.purchase_date >= date_from)
    if date_to:
        query = query.filter(PurchaseEntry.purchase_date <= date_to)

    total = query.count()
    sort_column = _SORTABLE_FIELDS.get(sort_by, PurchaseEntry.created_at)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    rows = query.order_by(order).offset((page - 1) * page_size).limit(page_size).all()
    items = [
        PurchaseEntryListItemOut(
            id=p.id,
            vendor_id=p.vendor_id,
            vendor_name=vendor_name,
            purchase_number=p.purchase_number,
            vendor_invoice_number=p.vendor_invoice_number,
            purchase_date=p.purchase_date,
            status=p.status,
            total_amount=p.total_amount,
            payment_status=p.payment_status,
            outstanding_amount=p.outstanding_amount,
            created_at=p.created_at,
        )
        for p, vendor_name in rows
    ]
    return items, total


def get_purchase_entry(db: Session, tenant_id: str, purchase_id: str) -> PurchaseEntry | None:
    return db.query(PurchaseEntry).filter(PurchaseEntry.tenant_id == tenant_id, PurchaseEntry.id == purchase_id).first()


def to_purchase_out(db: Session, purchase: PurchaseEntry) -> PurchaseEntryOut:
    vendor = db.get(Vendor, purchase.vendor_id)
    user = db.get(User, purchase.created_by)
    return PurchaseEntryOut(
        id=purchase.id,
        tenant_id=purchase.tenant_id,
        vendor_id=purchase.vendor_id,
        vendor_name=vendor.name if vendor else "",
        purchase_number=purchase.purchase_number,
        vendor_invoice_number=purchase.vendor_invoice_number,
        purchase_date=purchase.purchase_date,
        status=purchase.status,
        subtotal=purchase.subtotal,
        discount_amount=purchase.discount_amount,
        tax_amount=purchase.tax_amount,
        total_amount=purchase.total_amount,
        payment_mode=purchase.payment_mode,
        payment_status=purchase.payment_status,
        paid_amount=purchase.paid_amount,
        outstanding_amount=purchase.outstanding_amount,
        due_date=purchase.due_date,
        remarks=purchase.remarks,
        created_by=purchase.created_by,
        created_by_name=f"{user.first_name} {user.last_name}" if user else "",
        created_at=purchase.created_at,
        cancelled_by=purchase.cancelled_by,
        cancelled_at=purchase.cancelled_at,
        cancel_reason=purchase.cancel_reason,
        items=[PurchaseEntryItemOut.model_validate(i) for i in purchase.items],
    )


def create_purchase_entry(db: Session, tenant_id: str, current_user: User, payload: PurchaseEntryCreate) -> PurchaseEntry:
    vendor = db.query(Vendor).filter(Vendor.tenant_id == tenant_id, Vendor.id == payload.vendor_id).first()
    if not vendor:
        raise PurchaseError(404, "Vendor not found")
    if not vendor.is_active:
        raise PurchaseError(400, "Cannot create a purchase for an inactive vendor")

    product_ids = [line.product_id for line in payload.items]
    products = {p.id: p for p in db.query(Product).filter(Product.tenant_id == tenant_id, Product.id.in_(product_ids)).all()}
    missing = set(product_ids) - set(products.keys())
    if missing:
        raise PurchaseError(400, f"Unknown product(s): {', '.join(missing)}")

    subtotal = 0.0
    tax_total = 0.0
    discount_total = 0.0
    items: list[PurchaseEntryItem] = []
    for line in payload.items:
        product = products[line.product_id]
        line_subtotal = round(line.quantity * line.unit_cost_price, 2)
        line_tax = round(line_subtotal * line.tax_rate_percent / 100, 2)
        line_total = round(line_subtotal + line_tax - line.discount_amount, 2)
        subtotal += line_subtotal
        tax_total += line_tax
        discount_total += line.discount_amount
        items.append(
            PurchaseEntryItem(
                product_id=product.id,
                product_name=product.name,
                quantity=line.quantity,
                unit=line.unit,
                unit_cost_price=line.unit_cost_price,
                tax_rate_percent=line.tax_rate_percent,
                tax_amount=line_tax,
                discount_amount=line.discount_amount,
                line_subtotal=line_subtotal,
                line_total=line_total,
            )
        )

    total_amount = round(subtotal + tax_total - discount_total, 2)
    immediate_payment = payload.status == "received" and payload.payment_mode in _IMMEDIATE_PAYMENT_MODES

    purchase = PurchaseEntry(
        tenant_id=tenant_id,
        vendor_id=vendor.id,
        purchase_number=_next_purchase_number(db, tenant_id),
        vendor_invoice_number=payload.vendor_invoice_number,
        purchase_date=payload.purchase_date,
        status=payload.status,
        subtotal=round(subtotal, 2),
        discount_amount=round(discount_total, 2),
        tax_amount=round(tax_total, 2),
        total_amount=total_amount,
        payment_mode=payload.payment_mode,
        payment_status="paid" if immediate_payment else "unpaid",
        paid_amount=total_amount if immediate_payment else 0.0,
        outstanding_amount=0.0 if (immediate_payment or payload.status == "draft") else total_amount,
        due_date=payload.due_date,
        remarks=payload.remarks,
        created_by=current_user.id,
    )
    purchase.items = items
    db.add(purchase)
    db.flush()

    if payload.status == "received":
        _apply_receipt_effects(db, tenant_id, purchase, current_user)
        if not immediate_payment:
            vendor.outstanding_amount = round(vendor.outstanding_amount + total_amount, 2)
            db.add(vendor)

    log_activity(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        module=MODULE_PURCHASE,
        action=ACTION_CREATED,
        description=f"{'Recorded' if payload.status == 'received' else 'Drafted'} purchase {purchase.purchase_number} from '{vendor.name}'",
        entity_type="PurchaseEntry",
        entity_id=purchase.id,
    )
    db.commit()
    db.refresh(purchase)
    return purchase


def confirm_purchase_entry(db: Session, purchase: PurchaseEntry, current_user: User) -> PurchaseEntry:
    if purchase.status != "draft":
        raise PurchaseError(400, "Only draft purchases can be confirmed")

    purchase.status = "received"
    db.add(purchase)
    db.flush()
    _apply_receipt_effects(db, purchase.tenant_id, purchase, current_user)

    immediate_payment = purchase.payment_mode in _IMMEDIATE_PAYMENT_MODES
    if immediate_payment:
        purchase.payment_status = "paid"
        purchase.paid_amount = purchase.total_amount
    else:
        purchase.outstanding_amount = purchase.total_amount
        vendor = db.get(Vendor, purchase.vendor_id)
        if vendor:
            vendor.outstanding_amount = round(vendor.outstanding_amount + purchase.total_amount, 2)
            db.add(vendor)
    db.add(purchase)

    log_activity(
        db,
        tenant_id=purchase.tenant_id,
        user_id=current_user.id,
        module=MODULE_PURCHASE,
        action=ACTION_CONFIRMED,
        description=f"Confirmed purchase {purchase.purchase_number}",
        entity_type="PurchaseEntry",
        entity_id=purchase.id,
    )
    db.commit()
    db.refresh(purchase)
    return purchase


def cancel_purchase_entry(db: Session, purchase: PurchaseEntry, current_user: User, reason: str | None) -> PurchaseEntry:
    if purchase.status == "cancelled":
        raise PurchaseError(400, "Purchase is already cancelled")

    if purchase.status == "received":
        for item in purchase.items:
            inv = (
                db.query(Inventory)
                .filter(Inventory.tenant_id == purchase.tenant_id, Inventory.product_id == item.product_id)
                .first()
            )
            if inv is None:
                continue
            previous_stock = inv.quantity
            new_stock = previous_stock - item.quantity
            inv.quantity = new_stock
            db.add(inv)
            # Cost price is intentionally NOT reversed here — a weighted-average is not
            # invertible once later purchases may have blended into it; the average simply
            # stays wherever it settled. This is a documented Phase 1 limitation.
            write_stock_history(
                db,
                tenant_id=purchase.tenant_id,
                product_id=item.product_id,
                previous_stock=previous_stock,
                added=0.0,
                removed=item.quantity,
                current_stock=new_stock,
                reason="purchase_cancelled",
                source="system",
                created_by=current_user.id,
                reference_id=purchase.id,
            )
        if purchase.outstanding_amount > 0:
            vendor = db.get(Vendor, purchase.vendor_id)
            if vendor:
                vendor.outstanding_amount = round(max(0.0, vendor.outstanding_amount - purchase.outstanding_amount), 2)
                db.add(vendor)

    purchase.status = "cancelled"
    purchase.cancelled_by = current_user.id
    purchase.cancelled_at = datetime.now(timezone.utc)
    purchase.cancel_reason = reason
    db.add(purchase)

    log_activity(
        db,
        tenant_id=purchase.tenant_id,
        user_id=current_user.id,
        module=MODULE_PURCHASE,
        action=ACTION_CANCELLED,
        description=f"Cancelled purchase {purchase.purchase_number}",
        entity_type="PurchaseEntry",
        entity_id=purchase.id,
    )
    db.commit()
    db.refresh(purchase)
    return purchase
