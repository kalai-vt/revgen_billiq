from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.limits import assert_under_limit
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerUpdate


_SORTABLE_FIELDS = {"name": Customer.name, "mobile": Customer.mobile, "email": Customer.email}


def list_customers(
    db: Session,
    tenant_id: str,
    q: str | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "name",
    sort_dir: str = "asc",
) -> tuple[list[Customer], int]:
    query = db.query(Customer).filter(Customer.tenant_id == tenant_id)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(Customer.name.ilike(pattern), Customer.mobile.ilike(pattern), Customer.email.ilike(pattern))
        )
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)

    total = query.with_entities(func.count(Customer.id)).scalar() or 0
    sort_column = _SORTABLE_FIELDS.get(sort_by, Customer.name)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    items = query.order_by(order).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


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
    return query.order_by(Customer.name).all()


def create_customer(db: Session, tenant_id: str, payload: CustomerCreate) -> Customer:
    customer_count = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0
    assert_under_limit(db, tenant_id, "max_customers", customer_count)

    customer = Customer(tenant_id=tenant_id, **payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def get_customer(db: Session, tenant_id: str, customer_id: str) -> Customer | None:
    return db.query(Customer).filter(Customer.tenant_id == tenant_id, Customer.id == customer_id).first()


def update_customer(db: Session, customer: Customer, payload: CustomerUpdate) -> Customer:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


def delete_customer(db: Session, customer: Customer) -> None:
    db.delete(customer)
    db.commit()
