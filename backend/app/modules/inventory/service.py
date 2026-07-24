from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.activity import ACTION_STOCK_UPDATED, MODULE_INVENTORY, log_activity
from app.core.notifications import TYPE_LOW_STOCK, create_notification
from app.models.catalog import Category, Product
from app.models.inventory import Inventory, StockHistory
from app.models.user import User
from app.schemas.inventory import (
    InventoryDashboardOut,
    InventoryOut,
    StockAdjustRequest,
    StockHistoryOut,
)


class InventoryError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _to_inventory_out(inv: Inventory, product: Product, category_name: str | None) -> InventoryOut:
    return InventoryOut(
        product_id=product.id,
        product_name=product.name,
        identifier_type=product.identifier_type,
        identifier_value=product.identifier_value,
        category_name=category_name,
        quantity=inv.quantity,
        reorder_level=inv.reorder_level,
        cost_price=product.cost_price,
        selling_price=product.selling_price,
        tax_rate_percent=product.tax_rate_percent,
        is_low_stock=0 < inv.quantity <= inv.reorder_level,
        is_out_of_stock=inv.quantity <= 0,
        updated_at=inv.updated_at,
    )


def _to_stock_history_out(db: Session, history: StockHistory) -> StockHistoryOut:
    product = db.get(Product, history.product_id)
    user = db.get(User, history.created_by)
    return StockHistoryOut(
        id=history.id,
        product_id=history.product_id,
        product_name=product.name if product else "",
        previous_stock=history.previous_stock,
        added=history.added,
        removed=history.removed,
        current_stock=history.current_stock,
        reason=history.reason,
        source=history.source,
        notes=history.notes,
        created_by=history.created_by,
        created_by_name=f"{user.first_name} {user.last_name}" if user else "",
        created_at=history.created_at,
    )


def write_stock_history(
    db: Session,
    tenant_id: str,
    product_id: str,
    previous_stock: float,
    added: float,
    removed: float,
    current_stock: float,
    reason: str,
    source: str,
    created_by: str,
    notes: str | None = None,
    reference_id: str | None = None,
) -> StockHistory:
    history = StockHistory(
        tenant_id=tenant_id,
        product_id=product_id,
        previous_stock=previous_stock,
        added=added,
        removed=removed,
        current_stock=current_stock,
        reason=reason,
        source=source,
        reference_id=reference_id,
        notes=notes,
        created_by=created_by,
    )
    db.add(history)
    db.flush()

    product = db.get(Product, product_id)
    product_label = product.name if product else product_id
    delta = f"+{added:g}" if added else f"-{removed:g}"
    log_activity(
        db,
        tenant_id=tenant_id,
        user_id=created_by,
        module=MODULE_INVENTORY,
        action=ACTION_STOCK_UPDATED,
        description=f"Stock {delta} for '{product_label}' ({reason})",
        entity_type="Product",
        entity_id=product_id,
    )

    inv = db.query(Inventory).filter(Inventory.tenant_id == tenant_id, Inventory.product_id == product_id).first()
    if inv is not None and previous_stock > inv.reorder_level >= current_stock:
        # Only fire on the downward crossing into low-stock territory, not on every sale
        # while a product is already below threshold — that would spam the panel.
        create_notification(
            db,
            tenant_id=tenant_id,
            type=TYPE_LOW_STOCK,
            title="Low stock",
            message=f"'{product_label}' is now at {current_stock:g} units (reorder level {inv.reorder_level:g}).",
            entity_type="Product",
            entity_id=product_id,
        )

    return history


def _inventory_query(
    db: Session, tenant_id: str, q: str | None, category_id: str | None, stock_status: str | None
):
    query = (
        db.query(Inventory, Product, Category.name)
        .join(Product, Inventory.product_id == Product.id)
        .outerjoin(Category, Product.category_id == Category.id)
        .filter(Inventory.tenant_id == tenant_id)
    )
    if q:
        pattern = f"%{q}%"
        query = query.filter(or_(Product.name.ilike(pattern), Product.identifier_value.ilike(pattern)))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if stock_status == "low":
        query = query.filter(Inventory.quantity > 0, Inventory.quantity <= Inventory.reorder_level)
    elif stock_status == "out":
        query = query.filter(Inventory.quantity <= 0)
    return query


_SORTABLE_FIELDS = {
    "name": Product.name,
    "quantity": Inventory.quantity,
    "cost_price": Product.cost_price,
    "selling_price": Product.selling_price,
    "updated_at": Inventory.updated_at,
}


def list_inventory(
    db: Session,
    tenant_id: str,
    q: str | None = None,
    category_id: str | None = None,
    stock_status: str | None = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "name",
    sort_dir: str = "asc",
) -> tuple[list[InventoryOut], int]:
    query = _inventory_query(db, tenant_id, q, category_id, stock_status)
    total = query.with_entities(func.count(Inventory.id)).scalar() or 0
    sort_column = _SORTABLE_FIELDS.get(sort_by, Product.name)
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()
    rows = query.order_by(order).offset((page - 1) * page_size).limit(page_size).all()
    items = [_to_inventory_out(inv, product, category_name) for inv, product, category_name in rows]
    return items, total


def list_inventory_for_export(
    db: Session,
    tenant_id: str,
    q: str | None = None,
    category_id: str | None = None,
    stock_status: str | None = None,
) -> list[InventoryOut]:
    rows = _inventory_query(db, tenant_id, q, category_id, stock_status).order_by(Product.name).all()
    return [_to_inventory_out(inv, product, category_name) for inv, product, category_name in rows]


def get_dashboard(db: Session, tenant_id: str) -> InventoryDashboardOut:
    base = (
        db.query(Inventory)
        .join(Product, Inventory.product_id == Product.id)
        .filter(Inventory.tenant_id == tenant_id, Product.is_active.is_(True))
    )
    total_products = base.count()
    total_stock_quantity = base.with_entities(func.coalesce(func.sum(Inventory.quantity), 0.0)).scalar() or 0.0
    inventory_value = (
        db.query(func.coalesce(func.sum(Inventory.quantity * Product.cost_price), 0.0))
        .join(Product, Inventory.product_id == Product.id)
        .filter(Inventory.tenant_id == tenant_id, Product.is_active.is_(True))
        .scalar()
        or 0.0
    )
    low_stock_count = base.filter(Inventory.quantity > 0, Inventory.quantity <= Inventory.reorder_level).count()
    out_of_stock_count = base.filter(Inventory.quantity <= 0).count()

    recent_rows = (
        db.query(Inventory, Product, Category.name)
        .join(Product, Inventory.product_id == Product.id)
        .outerjoin(Category, Product.category_id == Category.id)
        .filter(Inventory.tenant_id == tenant_id)
        .order_by(Inventory.updated_at.desc())
        .limit(5)
        .all()
    )
    recently_updated = [_to_inventory_out(inv, product, category_name) for inv, product, category_name in recent_rows]

    return InventoryDashboardOut(
        total_products=total_products,
        total_stock_quantity=round(total_stock_quantity, 2),
        inventory_value=round(inventory_value, 2),
        low_stock_count=low_stock_count,
        out_of_stock_count=out_of_stock_count,
        recently_updated=recently_updated,
    )


def adjust_stock(
    db: Session, tenant_id: str, product_id: str, current_user: User, payload: StockAdjustRequest
) -> StockHistoryOut:
    inv = db.query(Inventory).filter(Inventory.tenant_id == tenant_id, Inventory.product_id == product_id).first()
    if not inv:
        raise InventoryError(404, "Product not found")

    previous = inv.quantity
    added = 0.0
    removed = 0.0

    if payload.movement_type == "add":
        if payload.quantity <= 0:
            raise InventoryError(400, "Quantity to add must be greater than 0")
        added = payload.quantity
        new_quantity = previous + added
    elif payload.movement_type == "reduce":
        if payload.quantity <= 0:
            raise InventoryError(400, "Quantity to reduce must be greater than 0")
        if payload.quantity > previous:
            raise InventoryError(400, "Cannot reduce more than the current stock")
        removed = payload.quantity
        new_quantity = previous - removed
    else:
        new_quantity = payload.quantity
        if new_quantity >= previous:
            added = new_quantity - previous
        else:
            removed = previous - new_quantity

    inv.quantity = new_quantity
    db.add(inv)

    history = write_stock_history(
        db,
        tenant_id=tenant_id,
        product_id=product_id,
        previous_stock=previous,
        added=added,
        removed=removed,
        current_stock=new_quantity,
        reason=payload.reason,
        source="manual",
        created_by=current_user.id,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(history)
    return _to_stock_history_out(db, history)


def list_stock_history(
    db: Session, tenant_id: str, product_id: str | None = None, page: int = 1, page_size: int = 20
) -> tuple[list[StockHistoryOut], int]:
    query = (
        db.query(StockHistory, Product.name, User.first_name, User.last_name)
        .join(Product, StockHistory.product_id == Product.id)
        .join(User, StockHistory.created_by == User.id)
        .filter(StockHistory.tenant_id == tenant_id)
    )
    if product_id:
        query = query.filter(StockHistory.product_id == product_id)

    total = query.with_entities(func.count(StockHistory.id)).scalar() or 0
    rows = (
        query.order_by(StockHistory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        StockHistoryOut(
            id=history.id,
            product_id=history.product_id,
            product_name=product_name,
            previous_stock=history.previous_stock,
            added=history.added,
            removed=history.removed,
            current_stock=history.current_stock,
            reason=history.reason,
            source=history.source,
            notes=history.notes,
            created_by=history.created_by,
            created_by_name=f"{first_name} {last_name}",
            created_at=history.created_at,
        )
        for history, product_name, first_name, last_name in rows
    ]
    return items, total
