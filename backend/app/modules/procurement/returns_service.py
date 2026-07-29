from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.activity import ACTION_CANCELLED, ACTION_CREATED, MODULE_PURCHASE_RETURN, log_activity
from app.models.inventory import Inventory
from app.models.procurement import PurchaseEntry, PurchaseEntryItem, PurchaseReturn, PurchaseReturnItem, Vendor
from app.models.user import User
from app.modules.inventory.service import write_stock_history
from app.schemas.purchase_returns import PurchaseReturnCreate, PurchaseReturnItemOut, PurchaseReturnListItemOut, PurchaseReturnOut

_SORTABLE_FIELDS = {"created_at": PurchaseReturn.created_at, "refund_amount": PurchaseReturn.refund_amount}


class PurchaseReturnError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _next_return_number(db: Session, tenant_id: str) -> str:
    count = db.query(func.count(PurchaseReturn.id)).filter(PurchaseReturn.tenant_id == tenant_id).scalar() or 0
    year = datetime.now(timezone.utc).year
    return f"PR-{year}-{count + 1:06d}"


def list_purchase_returns(
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
) -> tuple[list[PurchaseReturnListItemOut], int]:
    query = (
        db.query(PurchaseReturn, Vendor.name, PurchaseEntry.purchase_number)
        .join(Vendor, PurchaseReturn.vendor_id == Vendor.id)
        .join(PurchaseEntry, PurchaseReturn.purchase_entry_id == PurchaseEntry.id)
        .filter(PurchaseReturn.tenant_id == tenant_id)
    )
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(PurchaseReturn.return_number.ilike(pattern), Vendor.name.ilike(pattern), PurchaseEntry.purchase_number.ilike(pattern))
        )
    if vendor_id:
        query = query.filter(PurchaseReturn.vendor_id == vendor_id)
    if status:
        query = query.filter(PurchaseReturn.status == status)
    if date_from:
        query = query.filter(func.date(PurchaseReturn.created_at) >= date_from)
    if date_to:
        query = query.filter(func.date(PurchaseReturn.created_at) <= date_to)

    total = query.count()
    sort_column = _SORTABLE_FIELDS.get(sort_by, PurchaseReturn.created_at)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    rows = query.order_by(order).offset((page - 1) * page_size).limit(page_size).all()
    items = [
        PurchaseReturnListItemOut(
            id=ret.id,
            return_number=ret.return_number,
            purchase_entry_id=ret.purchase_entry_id,
            purchase_number=purchase_number,
            vendor_id=ret.vendor_id,
            vendor_name=vendor_name,
            status=ret.status,
            refund_amount=ret.refund_amount,
            created_at=ret.created_at,
        )
        for ret, vendor_name, purchase_number in rows
    ]
    return items, total


def get_purchase_return(db: Session, tenant_id: str, return_id: str) -> PurchaseReturn | None:
    return db.query(PurchaseReturn).filter(PurchaseReturn.tenant_id == tenant_id, PurchaseReturn.id == return_id).first()


def to_return_out(db: Session, ret: PurchaseReturn) -> PurchaseReturnOut:
    vendor = db.get(Vendor, ret.vendor_id)
    purchase = db.get(PurchaseEntry, ret.purchase_entry_id)
    user = db.get(User, ret.created_by)
    return PurchaseReturnOut(
        id=ret.id,
        tenant_id=ret.tenant_id,
        purchase_entry_id=ret.purchase_entry_id,
        purchase_number=purchase.purchase_number if purchase else "",
        vendor_id=ret.vendor_id,
        vendor_name=vendor.name if vendor else "",
        return_number=ret.return_number,
        reason=ret.reason,
        status=ret.status,
        subtotal_amount=ret.subtotal_amount,
        tax_adjustment=ret.tax_adjustment,
        refund_amount=ret.refund_amount,
        refund_method=ret.refund_method,
        created_by=ret.created_by,
        created_by_name=f"{user.first_name} {user.last_name}" if user else "",
        created_at=ret.created_at,
        cancelled_by=ret.cancelled_by,
        cancelled_at=ret.cancelled_at,
        cancel_reason=ret.cancel_reason,
        items=[PurchaseReturnItemOut.model_validate(i) for i in ret.items],
    )


def create_purchase_return(db: Session, tenant_id: str, current_user: User, payload: PurchaseReturnCreate) -> PurchaseReturn:
    purchase = (
        db.query(PurchaseEntry)
        .filter(PurchaseEntry.tenant_id == tenant_id, PurchaseEntry.id == payload.purchase_entry_id)
        .first()
    )
    if not purchase:
        raise PurchaseReturnError(404, "Purchase not found")
    if purchase.status != "received":
        raise PurchaseReturnError(400, "Only received purchases can be returned")

    items_by_id = {item.id: item for item in purchase.items}

    return_record = PurchaseReturn(
        tenant_id=tenant_id,
        purchase_entry_id=purchase.id,
        vendor_id=purchase.vendor_id,
        return_number=_next_return_number(db, tenant_id),
        reason=payload.reason,
        refund_method=payload.refund_method,
        created_by=current_user.id,
    )
    db.add(return_record)
    db.flush()

    total_subtotal = 0.0
    total_tax = 0.0
    total_refund = 0.0
    for line in payload.lines:
        item = items_by_id.get(line.purchase_entry_item_id)
        if item is None:
            raise PurchaseReturnError(404, f"Purchase item {line.purchase_entry_item_id} not found on this purchase")

        remaining = round(item.quantity - item.returned_quantity, 6)
        if line.quantity > remaining:
            raise PurchaseReturnError(
                400, f"Cannot return more than the remaining {remaining:g} unit(s) of '{item.product_name}'"
            )

        share = line.quantity / item.quantity
        line_subtotal_refund = round(item.line_subtotal * share, 2)
        line_tax_refund = round(item.tax_amount * share, 2)
        line_refund_amount = round((item.line_total / item.quantity) * line.quantity, 2)

        total_subtotal += line_subtotal_refund
        total_tax += line_tax_refund
        total_refund += line_refund_amount

        db.add(
            PurchaseReturnItem(
                purchase_return_id=return_record.id,
                purchase_entry_item_id=item.id,
                product_id=item.product_id,
                product_name=item.product_name,
                quantity_returned=line.quantity,
                unit_cost_price=item.unit_cost_price,
                line_refund_amount=line_refund_amount,
                reason=line.reason,
            )
        )

        item.returned_quantity = round(item.returned_quantity + line.quantity, 6)
        db.add(item)

        # A purchase return always decreases stock — the goods physically leave, unlike a sales
        # return where "restock vs. discard" is a real choice.
        inv = db.query(Inventory).filter(Inventory.tenant_id == tenant_id, Inventory.product_id == item.product_id).first()
        if inv is not None:
            previous_stock = inv.quantity
            inv.quantity = previous_stock - line.quantity
            db.add(inv)
            write_stock_history(
                db,
                tenant_id=tenant_id,
                product_id=item.product_id,
                previous_stock=previous_stock,
                added=0.0,
                removed=line.quantity,
                current_stock=inv.quantity,
                reason="purchase_return",
                source="system",
                created_by=current_user.id,
                reference_id=return_record.id,
            )

    return_record.subtotal_amount = round(total_subtotal, 2)
    return_record.tax_adjustment = round(total_tax, 2)
    return_record.refund_amount = round(total_refund, 2)
    db.add(return_record)

    # The return acts as a credit against what's still owed on this purchase — capped at what's
    # actually outstanding rather than going negative (a return on an already-fully-paid purchase
    # records a refund but doesn't manufacture a negative payable; true credit-note carry-forward
    # to a future purchase is out of scope for this phase).
    applied_credit = min(total_refund, purchase.outstanding_amount)
    if applied_credit > 0:
        purchase.outstanding_amount = round(purchase.outstanding_amount - applied_credit, 2)
        db.add(purchase)
        vendor = db.get(Vendor, purchase.vendor_id)
        if vendor:
            vendor.outstanding_amount = round(max(0.0, vendor.outstanding_amount - applied_credit), 2)
            db.add(vendor)

    log_activity(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        module=MODULE_PURCHASE_RETURN,
        action=ACTION_CREATED,
        description=f"Returned {return_record.return_number} against purchase {purchase.purchase_number}",
        entity_type="PurchaseReturn",
        entity_id=return_record.id,
    )
    db.commit()
    db.refresh(return_record)
    return return_record


def cancel_purchase_return(db: Session, ret: PurchaseReturn, current_user: User, reason: str | None) -> PurchaseReturn:
    if ret.status == "cancelled":
        raise PurchaseReturnError(400, "Return is already cancelled")

    purchase = db.get(PurchaseEntry, ret.purchase_entry_id)
    items_by_id: dict[str, PurchaseEntryItem] = {i.id: i for i in purchase.items} if purchase else {}

    for line in ret.items:
        item = items_by_id.get(line.purchase_entry_item_id)
        if item is not None:
            item.returned_quantity = max(0.0, round(item.returned_quantity - line.quantity_returned, 6))
            db.add(item)

        inv = db.query(Inventory).filter(Inventory.tenant_id == ret.tenant_id, Inventory.product_id == line.product_id).first()
        if inv is not None:
            previous_stock = inv.quantity
            inv.quantity = previous_stock + line.quantity_returned
            db.add(inv)
            write_stock_history(
                db,
                tenant_id=ret.tenant_id,
                product_id=line.product_id,
                previous_stock=previous_stock,
                added=line.quantity_returned,
                removed=0.0,
                current_stock=inv.quantity,
                reason="purchase_return_cancelled",
                source="system",
                created_by=current_user.id,
                reference_id=ret.id,
            )

    if purchase is not None:
        applied_credit = min(ret.refund_amount, purchase.total_amount - purchase.outstanding_amount)
        applied_credit = max(0.0, applied_credit)
        if applied_credit > 0:
            purchase.outstanding_amount = round(purchase.outstanding_amount + applied_credit, 2)
            db.add(purchase)
            vendor = db.get(Vendor, purchase.vendor_id)
            if vendor:
                vendor.outstanding_amount = round(vendor.outstanding_amount + applied_credit, 2)
                db.add(vendor)

    ret.status = "cancelled"
    ret.cancelled_by = current_user.id
    ret.cancelled_at = datetime.now(timezone.utc)
    ret.cancel_reason = reason
    db.add(ret)

    log_activity(
        db,
        tenant_id=ret.tenant_id,
        user_id=current_user.id,
        module=MODULE_PURCHASE_RETURN,
        action=ACTION_CANCELLED,
        description=f"Cancelled return {ret.return_number}",
        entity_type="PurchaseReturn",
        entity_id=ret.id,
    )
    db.commit()
    db.refresh(ret)
    return ret
