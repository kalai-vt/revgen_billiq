from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.activity import ACTION_CANCELLED, ACTION_CREATED, MODULE_INVOICE, log_activity
from app.core.limits import assert_under_limit
from app.core.notifications import TYPE_INVOICE_CANCELLED, create_notification
from app.models.audit import PriceOverrideAudit
from app.models.catalog import Product
from app.models.customer import Customer
from app.models.inventory import Inventory
from app.models.returns import Return, ReturnItem
from app.models.sales import Invoice, InvoiceItem
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.models.user import User
from app.modules.inventory.service import write_stock_history
from app.schemas.sales import InvoiceCreate, ReturnCreate


class SalesError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _can_override_price(db: Session, user: User) -> bool:
    if user.role == "owner":
        return True
    if user.role == "manager":
        settings = db.query(Settings).filter(Settings.tenant_id == user.tenant_id).first()
        return bool(settings and settings.allow_manager_price_override)
    return False


def _next_invoice_number(db: Session, tenant_id: str) -> str:
    count = db.query(func.count(Invoice.id)).filter(Invoice.tenant_id == tenant_id).scalar() or 0
    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    prefix = settings.invoice_prefix if settings else "INV"
    # starting_invoice_number is a base offset, not a one-time seed — using base + count (rather
    # than only applying it when count == 0) guarantees consecutive invoices always increment by
    # exactly 1 and never jump backwards to a small count-based number after the first one.
    base = settings.starting_invoice_number if settings else 1
    next_number = base + count
    return f"{prefix}-{next_number:06d}"


def _month_start_utc(tenant: Tenant | None) -> datetime:
    tz_name = tenant.timezone if tenant else "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    local_now = datetime.now(tz)
    local_month_start = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return local_month_start.astimezone(timezone.utc)


_SORTABLE_FIELDS = {"created_at": Invoice.created_at, "total_amount": Invoice.total_amount, "invoice_number": Invoice.invoice_number}


def list_invoices(
    db: Session,
    tenant_id: str,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
) -> tuple[list[Invoice], int]:
    query = (
        db.query(Invoice)
        .options(joinedload(Invoice.items))
        .filter(Invoice.tenant_id == tenant_id)
    )

    if q:
        pattern = f"%{q}%"
        item_match = (
            db.query(InvoiceItem.id)
            .filter(
                InvoiceItem.invoice_id == Invoice.id,
                or_(InvoiceItem.product_name.ilike(pattern), InvoiceItem.identifier_value.ilike(pattern)),
            )
            .exists()
        )
        query = query.filter(
            or_(
                Invoice.invoice_number.ilike(pattern),
                Invoice.customer_name.ilike(pattern),
                Invoice.customer_phone.ilike(pattern),
                item_match,
            )
        )

    if date_from:
        query = query.filter(Invoice.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        query = query.filter(Invoice.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    if status:
        query = query.filter(Invoice.status == status)

    total = query.with_entities(func.count(Invoice.id)).scalar() or 0

    sort_column = _SORTABLE_FIELDS.get(sort_by, Invoice.created_at)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()

    items = query.order_by(order).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def list_invoices_for_export(
    db: Session,
    tenant_id: str,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
) -> list[Invoice]:
    query = db.query(Invoice).filter(Invoice.tenant_id == tenant_id)

    if q:
        pattern = f"%{q}%"
        item_match = (
            db.query(InvoiceItem.id)
            .filter(
                InvoiceItem.invoice_id == Invoice.id,
                or_(InvoiceItem.product_name.ilike(pattern), InvoiceItem.identifier_value.ilike(pattern)),
            )
            .exists()
        )
        query = query.filter(
            or_(
                Invoice.invoice_number.ilike(pattern),
                Invoice.customer_name.ilike(pattern),
                Invoice.customer_phone.ilike(pattern),
                item_match,
            )
        )

    if date_from:
        query = query.filter(Invoice.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        query = query.filter(Invoice.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    if status:
        query = query.filter(Invoice.status == status)

    sort_column = _SORTABLE_FIELDS.get(sort_by, Invoice.created_at)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    return query.order_by(order).all()


def get_invoice(db: Session, tenant_id: str, invoice_id: str) -> Invoice | None:
    return (
        db.query(Invoice)
        .options(joinedload(Invoice.items))
        .filter(Invoice.tenant_id == tenant_id, Invoice.id == invoice_id)
        .first()
    )


def create_invoice(db: Session, tenant_id: str, current_user: User, payload: InvoiceCreate) -> Invoice:
    tenant = db.get(Tenant, tenant_id)
    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()

    month_start = _month_start_utc(tenant)
    monthly_invoice_count = (
        db.query(func.count(Invoice.id))
        .filter(Invoice.tenant_id == tenant_id, Invoice.created_at >= month_start)
        .scalar()
        or 0
    )
    assert_under_limit(db, tenant_id, "max_monthly_invoices", monthly_invoice_count)

    resolved: list[tuple[Product, float, float, float]] = []
    subtotal = 0.0

    for line in payload.lines:
        product = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.id == line.product_id, Product.is_active.is_(True))
            .first()
        )
        if not product:
            raise SalesError(404, f"Product {line.product_id} not found")

        unit_price = product.selling_price
        if line.unit_price is not None:
            if not _can_override_price(db, current_user):
                raise SalesError(403, "You don't have permission to override prices")
            unit_price = line.unit_price

        if settings and not settings.allow_negative_stock:
            inv = db.query(Inventory).filter(Inventory.tenant_id == tenant_id, Inventory.product_id == product.id).first()
            if inv is not None and inv.quantity - line.quantity < 0:
                raise SalesError(400, f"Insufficient stock for '{product.name}' (only {inv.quantity:g} available)")

        line_subtotal = unit_price * line.quantity
        resolved.append((product, line.quantity, unit_price, line_subtotal))
        subtotal += line_subtotal

    subtotal = round(subtotal, 2)

    if payload.discount_type == "flat":
        discount_amount = min(payload.discount_value, subtotal)
    elif payload.discount_type == "percent":
        discount_amount = subtotal * (min(payload.discount_value, 100) / 100)
    else:
        discount_amount = 0.0
    discount_amount = round(discount_amount, 2)

    taxable_amount = round(subtotal - discount_amount, 2)
    tax_amount = round(taxable_amount * (payload.tax_percentage / 100), 2)
    total_amount = round(taxable_amount + tax_amount, 2)

    customer_name = payload.customer_name
    customer_phone = payload.customer_phone
    if payload.customer_id:
        customer = db.query(Customer).filter(Customer.tenant_id == tenant_id, Customer.id == payload.customer_id).first()
        if not customer:
            raise SalesError(404, "Customer not found")
        customer_name = customer_name or customer.name
        customer_phone = customer_phone or customer.mobile

    invoice = Invoice(
        tenant_id=tenant_id,
        created_by=current_user.id,
        invoice_number=_next_invoice_number(db, tenant_id),
        customer_id=payload.customer_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        gst_number=settings.gst_number if settings else None,
        status="paid",
        subtotal=subtotal,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        discount_amount=discount_amount,
        taxable_amount=taxable_amount,
        tax_percentage=payload.tax_percentage,
        tax_amount=tax_amount,
        total_amount=total_amount,
        payment_method=payload.payment_method,
        amount_tendered=payload.amount_tendered,
    )
    db.add(invoice)
    db.flush()

    for product, quantity, unit_price, line_subtotal in resolved:
        proportional_discount = (line_subtotal / subtotal * discount_amount) if subtotal > 0 else 0.0
        line_taxable = line_subtotal - proportional_discount
        line_tax = round(line_taxable * (payload.tax_percentage / 100), 2)
        line_total = round(line_taxable + line_tax, 2)

        db.add(
            InvoiceItem(
                invoice_id=invoice.id,
                product_id=product.id,
                product_name=product.name,
                identifier_type=product.identifier_type,
                identifier_value=product.identifier_value,
                quantity=quantity,
                unit_price=unit_price,
                tax_rate_percent=payload.tax_percentage,
                tax_amount=line_tax,
                line_subtotal=line_subtotal,
                line_total=line_total,
            )
        )

        if unit_price != product.selling_price:
            db.add(
                PriceOverrideAudit(
                    tenant_id=tenant_id,
                    invoice_id=invoice.id,
                    product_id=product.id,
                    original_price=product.selling_price,
                    new_price=unit_price,
                    user_id=current_user.id,
                )
            )

        inv = db.query(Inventory).filter(Inventory.tenant_id == tenant_id, Inventory.product_id == product.id).first()
        if inv is not None:
            previous_stock = inv.quantity
            inv.quantity = previous_stock - quantity
            db.add(inv)
            write_stock_history(
                db,
                tenant_id=tenant_id,
                product_id=product.id,
                previous_stock=previous_stock,
                added=0.0,
                removed=quantity,
                current_stock=inv.quantity,
                reason="sale",
                source="system",
                created_by=current_user.id,
                reference_id=invoice.id,
            )

    if payload.payment_method == "cash":
        if payload.amount_tendered is None or payload.amount_tendered < invoice.total_amount:
            raise SalesError(400, "Amount tendered must be provided and cover the total for cash payments")
        invoice.change_due = round(payload.amount_tendered - invoice.total_amount, 2)

    db.add(invoice)

    log_activity(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        module=MODULE_INVOICE,
        action=ACTION_CREATED,
        description=f"Created invoice {invoice.invoice_number} ({total_amount:.2f})",
        entity_type="Invoice",
        entity_id=invoice.id,
    )

    db.commit()
    return get_invoice(db, tenant_id, invoice.id)  # type: ignore[return-value]


def void_invoice(db: Session, invoice: Invoice, current_user: User) -> Invoice:
    if invoice.status == "cancelled":
        raise SalesError(400, "Invoice is already cancelled")
    if invoice.status in ("partial", "refunded"):
        raise SalesError(400, "Cannot cancel an invoice that already has returns against it")
    invoice.status = "cancelled"
    db.add(invoice)

    for item in invoice.items:
        inv = (
            db.query(Inventory)
            .filter(Inventory.tenant_id == invoice.tenant_id, Inventory.product_id == item.product_id)
            .first()
        )
        if inv is not None:
            previous_stock = inv.quantity
            inv.quantity = previous_stock + item.quantity
            db.add(inv)
            write_stock_history(
                db,
                tenant_id=invoice.tenant_id,
                product_id=item.product_id,
                previous_stock=previous_stock,
                added=item.quantity,
                removed=0.0,
                current_stock=inv.quantity,
                reason="sale_void",
                source="system",
                created_by=current_user.id,
                reference_id=invoice.id,
            )

    log_activity(
        db,
        tenant_id=invoice.tenant_id,
        user_id=current_user.id,
        module=MODULE_INVOICE,
        action=ACTION_CANCELLED,
        description=f"Cancelled invoice {invoice.invoice_number}",
        entity_type="Invoice",
        entity_id=invoice.id,
    )
    create_notification(
        db,
        tenant_id=invoice.tenant_id,
        type=TYPE_INVOICE_CANCELLED,
        title="Invoice cancelled",
        message=f"Invoice {invoice.invoice_number} was cancelled.",
        entity_type="Invoice",
        entity_id=invoice.id,
    )

    db.commit()
    return get_invoice(db, invoice.tenant_id, invoice.id)  # type: ignore[return-value]


def _next_return_number(db: Session, tenant_id: str) -> str:
    count = db.query(func.count(Return.id)).filter(Return.tenant_id == tenant_id).scalar() or 0
    return f"RET-{count + 1:06d}"


def _to_return_out(db: Session, ret: Return) -> Return:
    invoice = db.get(Invoice, ret.invoice_id)
    ret.invoice_number = invoice.invoice_number if invoice else ""  # type: ignore[attr-defined]
    return ret


def create_return(db: Session, invoice: Invoice, current_user: User, payload: ReturnCreate) -> Return:
    if invoice.status == "cancelled":
        raise SalesError(400, "Cannot return items on a cancelled invoice")

    items_by_id = {item.id: item for item in invoice.items}

    return_record = Return(
        tenant_id=invoice.tenant_id,
        invoice_id=invoice.id,
        return_number=_next_return_number(db, invoice.tenant_id),
        reason=payload.reason,
        refund_amount=0.0,
        refund_method=invoice.payment_method,
        created_by=current_user.id,
    )
    db.add(return_record)
    db.flush()

    total_refund = 0.0
    for line in payload.lines:
        item = items_by_id.get(line.invoice_item_id)
        if item is None:
            raise SalesError(404, f"Invoice item {line.invoice_item_id} not found on this invoice")

        remaining = round(item.quantity - item.returned_quantity, 6)
        if line.quantity > remaining:
            raise SalesError(
                400,
                f"Cannot return more than the remaining {remaining:g} unit(s) of '{item.product_name}'",
            )

        unit_refund = item.line_total / item.quantity
        line_refund_amount = round(unit_refund * line.quantity, 2)
        total_refund += line_refund_amount

        db.add(
            ReturnItem(
                return_id=return_record.id,
                invoice_item_id=item.id,
                product_id=item.product_id,
                product_name=item.product_name,
                quantity_returned=line.quantity,
                unit_price=item.unit_price,
                line_refund_amount=line_refund_amount,
            )
        )

        item.returned_quantity += line.quantity
        db.add(item)

        inv = (
            db.query(Inventory)
            .filter(Inventory.tenant_id == invoice.tenant_id, Inventory.product_id == item.product_id)
            .first()
        )
        if inv is not None:
            previous_stock = inv.quantity
            inv.quantity = previous_stock + line.quantity
            db.add(inv)
            write_stock_history(
                db,
                tenant_id=invoice.tenant_id,
                product_id=item.product_id,
                previous_stock=previous_stock,
                added=line.quantity,
                removed=0.0,
                current_stock=inv.quantity,
                reason="return",
                source="system",
                created_by=current_user.id,
                reference_id=return_record.id,
            )

    return_record.refund_amount = round(total_refund, 2)
    db.add(return_record)

    fully_returned = all(item.returned_quantity >= item.quantity for item in invoice.items)
    invoice.status = "refunded" if fully_returned else "partial"
    db.add(invoice)

    db.commit()
    db.refresh(return_record)
    return _to_return_out(db, return_record)


def list_returns_for_invoice(db: Session, tenant_id: str, invoice_id: str) -> list[Return]:
    returns = (
        db.query(Return)
        .options(joinedload(Return.items))
        .filter(Return.tenant_id == tenant_id, Return.invoice_id == invoice_id)
        .order_by(Return.created_at.desc())
        .all()
    )
    return [_to_return_out(db, r) for r in returns]


def list_returns(
    db: Session, tenant_id: str, page: int = 1, page_size: int = 20
) -> tuple[list[Return], int]:
    query = db.query(Return).options(joinedload(Return.items)).filter(Return.tenant_id == tenant_id)
    total = query.with_entities(func.count(Return.id)).scalar() or 0
    items = (
        query.order_by(Return.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [_to_return_out(db, r) for r in items], total
