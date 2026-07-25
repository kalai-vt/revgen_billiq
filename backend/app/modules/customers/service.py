from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.activity import ACTION_CREDIT_SETTINGS_UPDATED, MODULE_CUSTOMER, log_activity
from app.core.limits import assert_under_limit
from app.models.customer import Customer
from app.models.payment import Payment
from app.models.sales import Invoice
from app.models.user import User
from app.schemas.customer import CustomerCreate, CustomerUpdate

_CREDIT_SETTINGS_FIELDS = {
    "is_credit_enabled",
    "credit_limit",
    "credit_days",
    "allow_credit_beyond_limit",
    "require_manager_approval",
    "auto_block_credit",
}

_SORTABLE_FIELDS = {"name": Customer.name, "mobile": Customer.mobile, "email": Customer.email}


def _customer_aggregates(db: Session, tenant_id: str, customer_ids: list[str] | None = None) -> dict[str, dict]:
    """customer_id -> {outstanding, overdue_amount, due_count, overdue_count, last_payment_date}."""
    today = date.today()
    query = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id, Invoice.status != "cancelled", Invoice.outstanding_amount > 0
    )
    if customer_ids is not None:
        query = query.filter(Invoice.customer_id.in_(customer_ids))

    agg: dict[str, dict] = {}
    for inv in query.all():
        if not inv.customer_id:
            continue
        bucket = agg.setdefault(
            inv.customer_id,
            {"outstanding": 0.0, "overdue_amount": 0.0, "due_count": 0, "overdue_count": 0, "last_payment_date": None},
        )
        bucket["outstanding"] += inv.outstanding_amount
        bucket["due_count"] += 1
        if inv.due_date and inv.due_date < today:
            bucket["overdue_amount"] += inv.outstanding_amount
            bucket["overdue_count"] += 1

    payment_query = db.query(Payment.customer_id, func.max(Payment.created_at)).filter(Payment.tenant_id == tenant_id)
    if customer_ids is not None:
        payment_query = payment_query.filter(Payment.customer_id.in_(customer_ids))
    for customer_id, last_date in payment_query.group_by(Payment.customer_id).all():
        agg.setdefault(
            customer_id,
            {"outstanding": 0.0, "overdue_amount": 0.0, "due_count": 0, "overdue_count": 0, "last_payment_date": None},
        )
        agg[customer_id]["last_payment_date"] = last_date

    return agg


def _annotate_customer(customer: Customer, agg: dict[str, dict]) -> Customer:
    bucket = agg.get(customer.id, {})
    customer.outstanding_amount = bucket.get("outstanding", 0.0)  # type: ignore[attr-defined]
    customer.overdue_amount = bucket.get("overdue_amount", 0.0)  # type: ignore[attr-defined]
    customer.due_invoices_count = bucket.get("due_count", 0)  # type: ignore[attr-defined]
    customer.overdue_invoices_count = bucket.get("overdue_count", 0)  # type: ignore[attr-defined]
    customer.last_payment_date = bucket.get("last_payment_date")  # type: ignore[attr-defined]
    return customer


def list_customers(
    db: Session,
    tenant_id: str,
    q: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "name",
    sort_dir: str = "asc",
    has_outstanding: bool | None = None,
    has_overdue: bool | None = None,
    due_today: bool | None = None,
    due_this_week: bool | None = None,
    credit_enabled: bool | None = None,
    credit_limit_exceeded: bool | None = None,
) -> tuple[list[Customer], int]:
    query = db.query(Customer).filter(Customer.tenant_id == tenant_id)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(Customer.name.ilike(pattern), Customer.mobile.ilike(pattern), Customer.email.ilike(pattern))
        )
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)
    if credit_enabled is not None:
        query = query.filter(Customer.is_credit_enabled == credit_enabled)

    sort_column = _SORTABLE_FIELDS.get(sort_by, Customer.name)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    all_matching = query.order_by(order).all()

    needs_outstanding_filter = any(
        v is not None for v in (has_outstanding, has_overdue, due_today, due_this_week, credit_limit_exceeded)
    )
    if not needs_outstanding_filter:
        total = len(all_matching)
        page_items = all_matching[(page - 1) * page_size : (page - 1) * page_size + page_size]
        agg = _customer_aggregates(db, tenant_id, [c.id for c in page_items])
        return [_annotate_customer(c, agg) for c in page_items], total

    agg = _customer_aggregates(db, tenant_id, [c.id for c in all_matching])
    today = date.today()
    week_end = today + timedelta(days=7)
    due_today_ids, due_week_ids = _due_invoice_customer_ids(db, tenant_id, today, week_end)

    filtered: list[Customer] = []
    for customer in all_matching:
        bucket = agg.get(customer.id, {})
        if has_outstanding is not None and (bucket.get("outstanding", 0.0) > 0) != has_outstanding:
            continue
        if has_overdue is not None and (bucket.get("overdue_count", 0) > 0) != has_overdue:
            continue
        if due_today is not None and (customer.id in due_today_ids) != due_today:
            continue
        if due_this_week is not None and (customer.id in due_week_ids) != due_this_week:
            continue
        if credit_limit_exceeded is not None:
            exceeded = customer.credit_limit is not None and bucket.get("outstanding", 0.0) > customer.credit_limit
            if exceeded != credit_limit_exceeded:
                continue
        filtered.append(_annotate_customer(customer, agg))

    total = len(filtered)
    page_items = filtered[(page - 1) * page_size : (page - 1) * page_size + page_size]
    return page_items, total


def _due_invoice_customer_ids(db: Session, tenant_id: str, today: date, week_end: date) -> tuple[set[str], set[str]]:
    rows = (
        db.query(Invoice.customer_id, Invoice.due_date)
        .filter(
            Invoice.tenant_id == tenant_id,
            Invoice.status != "cancelled",
            Invoice.payment_status.in_(["credit", "partially_paid"]),
            Invoice.customer_id.isnot(None),
            Invoice.due_date.isnot(None),
        )
        .all()
    )
    due_today_ids = {cid for cid, due in rows if due == today}
    due_week_ids = {cid for cid, due in rows if due is not None and today <= due <= week_end}
    return due_today_ids, due_week_ids


def list_customers_for_export(
    db: Session, tenant_id: str, q: str | None = None, is_active: bool | None = None
) -> list[Customer]:
    query = db.query(Customer).filter(Customer.tenant_id == tenant_id)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(Customer.name.ilike(pattern), Customer.mobile.ilike(pattern), Customer.email.ilike(pattern))
        )
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)
    items = query.order_by(Customer.name).all()
    agg = _customer_aggregates(db, tenant_id, [c.id for c in items])
    return [_annotate_customer(c, agg) for c in items]


def create_customer(db: Session, tenant_id: str, payload: CustomerCreate) -> Customer:
    customer_count = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0
    assert_under_limit(db, tenant_id, "max_customers", customer_count)

    customer = Customer(tenant_id=tenant_id, **payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _annotate_customer(customer, {})


def get_customer(db: Session, tenant_id: str, customer_id: str) -> Customer | None:
    customer = db.query(Customer).filter(Customer.tenant_id == tenant_id, Customer.id == customer_id).first()
    if customer is None:
        return None
    agg = _customer_aggregates(db, tenant_id, [customer_id])
    return _annotate_customer(customer, agg)


def update_customer(db: Session, customer: Customer, payload: CustomerUpdate, current_user: User) -> Customer:
    changed_fields = payload.model_dump(exclude_unset=True)
    credit_settings_changed = bool(_CREDIT_SETTINGS_FIELDS & changed_fields.keys())

    for field, value in changed_fields.items():
        setattr(customer, field, value)
    db.add(customer)

    if credit_settings_changed:
        log_activity(
            db,
            tenant_id=customer.tenant_id,
            user_id=current_user.id,
            module=MODULE_CUSTOMER,
            action=ACTION_CREDIT_SETTINGS_UPDATED,
            description=f"Updated credit settings for '{customer.name}'",
            entity_type="Customer",
            entity_id=customer.id,
        )

    db.commit()
    db.refresh(customer)
    agg = _customer_aggregates(db, customer.tenant_id, [customer.id])
    return _annotate_customer(customer, agg)


def delete_customer(db: Session, customer: Customer) -> None:
    db.delete(customer)
    db.commit()
