from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.catalog import Category, Product
from app.models.customer import Customer
from app.models.inventory import Inventory
from app.models.sales import Invoice
from app.schemas.search import GlobalSearchOut, SearchResultItem

RESULTS_PER_TYPE = 5


def global_search(db: Session, tenant_id: str, q: str) -> GlobalSearchOut:
    pattern = f"%{q}%"

    products = (
        db.query(Product)
        .filter(
            Product.tenant_id == tenant_id,
            or_(Product.name.ilike(pattern), Product.identifier_value.ilike(pattern), Product.barcode.ilike(pattern)),
        )
        .order_by(Product.name)
        .limit(RESULTS_PER_TYPE)
        .all()
    )

    inventory_rows = (
        db.query(Product, Inventory.quantity)
        .join(Inventory, Inventory.product_id == Product.id)
        .filter(
            Product.tenant_id == tenant_id,
            or_(Product.name.ilike(pattern), Product.identifier_value.ilike(pattern), Product.barcode.ilike(pattern)),
        )
        .order_by(Product.name)
        .limit(RESULTS_PER_TYPE)
        .all()
    )

    customers = (
        db.query(Customer)
        .filter(
            Customer.tenant_id == tenant_id,
            or_(Customer.name.ilike(pattern), Customer.mobile.ilike(pattern)),
        )
        .order_by(Customer.name)
        .limit(RESULTS_PER_TYPE)
        .all()
    )

    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.tenant_id == tenant_id,
            or_(Invoice.invoice_number.ilike(pattern), Invoice.customer_name.ilike(pattern)),
        )
        .order_by(Invoice.created_at.desc())
        .limit(RESULTS_PER_TYPE)
        .all()
    )

    categories = (
        db.query(Category)
        .filter(Category.tenant_id == tenant_id, Category.name.ilike(pattern))
        .order_by(Category.name)
        .limit(RESULTS_PER_TYPE)
        .all()
    )

    return GlobalSearchOut(
        products=[SearchResultItem(id=p.id, label=p.name, subtitle=p.identifier_value) for p in products],
        customers=[SearchResultItem(id=c.id, label=c.name, subtitle=c.mobile) for c in customers],
        inventory=[
            SearchResultItem(id=p.id, label=p.name, subtitle=f"Stock: {quantity:g}") for p, quantity in inventory_rows
        ],
        invoices=[SearchResultItem(id=i.id, label=i.invoice_number, subtitle=i.customer_name) for i in invoices],
        categories=[SearchResultItem(id=c.id, label=c.name, subtitle=None) for c in categories],
    )
