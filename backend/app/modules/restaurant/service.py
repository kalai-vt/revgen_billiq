"""Restaurant table service: floors, tables, orders, KOTs, and billing an order into an Invoice.

Everything here maintains one invariant: the order is the single record of what a table has
consumed. KOTs are subsets of it sent to the kitchen, and billing turns it into exactly one
Invoice via the existing sales path — never a parallel sale that reporting would have to
reconcile against the order.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.catalog import Product
from app.models.restaurant import (
    Kot,
    KotItem,
    RestaurantFloor,
    RestaurantOrder,
    RestaurantOrderItem,
    RestaurantTable,
)
from app.models.sales import Invoice
from app.models.user import User
from app.modules.sales import service as sales_service
from app.schemas.restaurant import (
    TableQuickBillRequest,
    KOT_TRANSITIONS,
    FloorCreate,
    FloorUpdate,
    KotCreate,
    OrderBillRequest,
    OrderCreate,
    OrderItemCreate,
    OrderItemUpdate,
    OrderUpdate,
    SplitItemSelection,
    TableCreate,
    TableUpdate,
)
from app.schemas.sales import InvoiceCreate, InvoiceLineCreate


class RestaurantError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---- Numbering -------------------------------------------------------------------------------

def _next_sequence(db: Session, model, tenant_id: str, column, prefix: str) -> str:
    """Per-tenant sequential number like ORD-000012 / KOT-000045.

    Derived from the highest existing number rather than a stored counter so it stays correct
    even if rows are deleted, and scoped per tenant so one restaurant's numbering never depends
    on another's volume.
    """
    latest = db.execute(
        select(func.max(column)).where(model.tenant_id == tenant_id, column.like(f"{prefix}-%"))
    ).scalar_one_or_none()
    seq = 0
    if latest:
        tail = str(latest).rsplit("-", 1)[-1]
        if tail.isdigit():
            seq = int(tail)
    return f"{prefix}-{seq + 1:06d}"


# ---- Floors ----------------------------------------------------------------------------------

def list_floors(db: Session, tenant_id: str, *, include_inactive: bool = False) -> list[RestaurantFloor]:
    stmt = select(RestaurantFloor).where(RestaurantFloor.tenant_id == tenant_id)
    if not include_inactive:
        stmt = stmt.where(RestaurantFloor.is_active.is_(True))
    return list(db.execute(stmt.order_by(RestaurantFloor.sort_order, RestaurantFloor.name)).scalars())


def create_floor(db: Session, tenant_id: str, payload: FloorCreate) -> RestaurantFloor:
    if _floor_name_taken(db, tenant_id, payload.name):
        raise RestaurantError(400, f'A floor named "{payload.name}" already exists.')
    floor = RestaurantFloor(tenant_id=tenant_id, name=payload.name.strip(), sort_order=payload.sort_order)
    db.add(floor)
    db.commit()
    db.refresh(floor)
    return floor


def _floor_name_taken(db: Session, tenant_id: str, name: str, exclude_id: str | None = None) -> bool:
    stmt = select(RestaurantFloor.id).where(
        RestaurantFloor.tenant_id == tenant_id, func.lower(RestaurantFloor.name) == name.strip().lower()
    )
    if exclude_id:
        stmt = stmt.where(RestaurantFloor.id != exclude_id)
    return db.execute(stmt).first() is not None


def update_floor(db: Session, tenant_id: str, floor_id: str, payload: FloorUpdate) -> RestaurantFloor:
    floor = _get_floor(db, tenant_id, floor_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] and _floor_name_taken(db, tenant_id, changes["name"], floor_id):
        raise RestaurantError(400, f'A floor named "{changes["name"]}" already exists.')
    for field, value in changes.items():
        setattr(floor, field, value)
    db.add(floor)
    db.commit()
    db.refresh(floor)
    return floor


def delete_floor(db: Session, tenant_id: str, floor_id: str) -> None:
    floor = _get_floor(db, tenant_id, floor_id)
    tables = db.execute(
        select(func.count()).select_from(RestaurantTable).where(
            RestaurantTable.tenant_id == tenant_id, RestaurantTable.floor_id == floor_id
        )
    ).scalar_one()
    if tables:
        # Deactivate instead of orphaning tables — a floor with tables on it is almost always a
        # rename/reorganize, not a mistake to erase.
        raise RestaurantError(400, "This floor still has tables. Move or delete them first.")
    db.delete(floor)
    db.commit()


def _get_floor(db: Session, tenant_id: str, floor_id: str) -> RestaurantFloor:
    floor = db.execute(
        select(RestaurantFloor).where(RestaurantFloor.tenant_id == tenant_id, RestaurantFloor.id == floor_id)
    ).scalar_one_or_none()
    if not floor:
        raise RestaurantError(404, "Floor not found.")
    return floor


# ---- Tables ----------------------------------------------------------------------------------

def _table_name_taken(db: Session, tenant_id: str, name: str, exclude_id: str | None = None) -> bool:
    stmt = select(RestaurantTable.id).where(
        RestaurantTable.tenant_id == tenant_id, func.lower(RestaurantTable.name) == name.strip().lower()
    )
    if exclude_id:
        stmt = stmt.where(RestaurantTable.id != exclude_id)
    return db.execute(stmt).first() is not None


def list_tables(db: Session, tenant_id: str, *, floor_id: str | None = None, include_inactive: bool = False) -> list[RestaurantTable]:
    stmt = select(RestaurantTable).where(RestaurantTable.tenant_id == tenant_id)
    if floor_id:
        stmt = stmt.where(RestaurantTable.floor_id == floor_id)
    if not include_inactive:
        stmt = stmt.where(RestaurantTable.is_active.is_(True))
    return list(db.execute(stmt.order_by(RestaurantTable.sort_order, RestaurantTable.name)).scalars())


def create_table(db: Session, tenant_id: str, payload: TableCreate) -> RestaurantTable:
    if _table_name_taken(db, tenant_id, payload.name):
        raise RestaurantError(400, f'A table named "{payload.name}" already exists.')
    if payload.floor_id:
        _get_floor(db, tenant_id, payload.floor_id)
    table = RestaurantTable(
        tenant_id=tenant_id,
        name=payload.name.strip(),
        floor_id=payload.floor_id,
        seats=payload.seats,
        sort_order=payload.sort_order,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return table


def update_table(db: Session, tenant_id: str, table_id: str, payload: TableUpdate) -> RestaurantTable:
    table = get_table(db, tenant_id, table_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] and _table_name_taken(db, tenant_id, changes["name"], table_id):
        raise RestaurantError(400, f'A table named "{changes["name"]}" already exists.')
    if changes.get("floor_id"):
        _get_floor(db, tenant_id, changes["floor_id"])
    for field, value in changes.items():
        setattr(table, field, value)
    db.add(table)
    db.commit()
    db.refresh(table)
    return table


def set_table_status(db: Session, tenant_id: str, table_id: str, status: str) -> RestaurantTable:
    table = get_table(db, tenant_id, table_id)
    active = _active_order_for_table(db, tenant_id, table_id)
    if active:
        # Reserving or clearing a table that is actively being served would desync the board from
        # the order behind it. The order has to be billed or cancelled first.
        raise RestaurantError(400, f"Table {table.name} has an open order. Bill or cancel it first.")
    table.status = status
    db.add(table)
    db.commit()
    db.refresh(table)
    return table


def delete_table(db: Session, tenant_id: str, table_id: str) -> None:
    table = get_table(db, tenant_id, table_id)
    if _active_order_for_table(db, tenant_id, table_id):
        raise RestaurantError(400, f"Table {table.name} has an open order. Bill or cancel it first.")
    db.delete(table)
    db.commit()


def get_table(db: Session, tenant_id: str, table_id: str) -> RestaurantTable:
    table = db.execute(
        select(RestaurantTable).where(RestaurantTable.tenant_id == tenant_id, RestaurantTable.id == table_id)
    ).scalar_one_or_none()
    if not table:
        raise RestaurantError(404, "Table not found.")
    return table


def sync_table_status(db: Session, table: RestaurantTable | None) -> None:
    """Keeps a table's status in step with the order on it.

    `occupied`/`billing` are consequences of order state, so they are never set by hand; a table
    with no live order falls back to `available` unless staff deliberately marked it `reserved`
    or `cleaning`, which have no order behind them and must survive.
    """
    if table is None:
        return
    active = _active_order_for_table(db, table.tenant_id, table.id)
    if active:
        table.status = "occupied"
    elif table.status in ("occupied", "billing"):
        table.status = "available"
    db.add(table)


def _active_order_for_table(db: Session, tenant_id: str, table_id: str) -> RestaurantOrder | None:
    return db.execute(
        select(RestaurantOrder).where(
            RestaurantOrder.tenant_id == tenant_id,
            RestaurantOrder.table_id == table_id,
            RestaurantOrder.status == "open",
        )
    ).scalars().first()


def floor_layout(db: Session, tenant_id: str) -> list[tuple[RestaurantFloor | None, list[tuple[RestaurantTable, RestaurantOrder | None]]]]:
    """The whole board in one pass: every floor with its tables and each table's open order.

    Deliberately not N+1 — the layout screen refreshes constantly, so orders are fetched once and
    matched in memory rather than queried per table.
    """
    floors = list_floors(db, tenant_id)
    tables = list_tables(db, tenant_id)
    open_orders = list(
        db.execute(
            select(RestaurantOrder)
            .where(RestaurantOrder.tenant_id == tenant_id, RestaurantOrder.status == "open")
            .options(selectinload(RestaurantOrder.items))
        ).scalars()
    )
    by_table: dict[str, RestaurantOrder] = {o.table_id: o for o in open_orders if o.table_id}

    grouped: list[tuple[RestaurantFloor | None, list[tuple[RestaurantTable, RestaurantOrder | None]]]] = []
    for floor in floors:
        rows = [(t, by_table.get(t.id)) for t in tables if t.floor_id == floor.id]
        grouped.append((floor, rows))
    unassigned = [(t, by_table.get(t.id)) for t in tables if not t.floor_id]
    if unassigned:
        grouped.append((None, unassigned))
    return grouped


# ---- Orders ----------------------------------------------------------------------------------

def _get_product(db: Session, tenant_id: str, product_id: str) -> Product:
    product = db.execute(
        select(Product).where(Product.tenant_id == tenant_id, Product.id == product_id)
    ).scalar_one_or_none()
    if not product:
        raise RestaurantError(404, "Product not found.")
    return product


def get_order(db: Session, tenant_id: str, order_id: str) -> RestaurantOrder:
    order = db.execute(
        select(RestaurantOrder)
        .where(RestaurantOrder.tenant_id == tenant_id, RestaurantOrder.id == order_id)
        .options(selectinload(RestaurantOrder.items), selectinload(RestaurantOrder.kots).selectinload(Kot.items))
    ).scalar_one_or_none()
    if not order:
        raise RestaurantError(404, "Order not found.")
    return order


def _require_open(order: RestaurantOrder) -> None:
    if order.status != "open":
        raise RestaurantError(400, f"This order is {order.status} and can no longer be changed.")


def create_order(db: Session, tenant_id: str, current_user: User, payload: OrderCreate) -> RestaurantOrder:
    table: RestaurantTable | None = None
    if payload.order_type == "dine_in":
        if not payload.table_id:
            raise RestaurantError(400, "A dine-in order needs a table.")
        table = get_table(db, tenant_id, payload.table_id)
        existing = _active_order_for_table(db, tenant_id, table.id)
        if existing:
            # Selecting an occupied table opens its existing order rather than starting a second
            # one on the same table — two live orders on one table is the bug this prevents.
            raise RestaurantError(409, f"Table {table.name} already has an open order.")

    order = RestaurantOrder(
        tenant_id=tenant_id,
        table_id=table.id if table else None,
        order_number=_next_sequence(db, RestaurantOrder, tenant_id, RestaurantOrder.order_number, "ORD"),
        order_type=payload.order_type,
        customer_id=payload.customer_id,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        guest_count=payload.guest_count,
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(order)
    db.flush()

    for line in payload.items:
        _append_item(db, tenant_id, order, line)

    sync_table_status(db, table)
    db.commit()
    return get_order(db, tenant_id, order.id)


def _append_item(db: Session, tenant_id: str, order: RestaurantOrder, line: OrderItemCreate) -> RestaurantOrderItem:
    product = _get_product(db, tenant_id, line.product_id)
    item = RestaurantOrderItem(
        order_id=order.id,
        product_id=product.id,
        product_name=product.name,
        identifier_value=getattr(product, "identifier_value", None),
        quantity=line.quantity,
        unit_price=line.unit_price if line.unit_price is not None else float(product.selling_price or 0),
        tax_rate_percent=float(getattr(product, "tax_rate_percent", 0) or 0),
        notes=line.notes,
    )
    db.add(item)
    return item


def add_items(db: Session, tenant_id: str, order_id: str, items: list[OrderItemCreate]) -> RestaurantOrder:
    order = get_order(db, tenant_id, order_id)
    _require_open(order)
    for line in items:
        _append_item(db, tenant_id, order, line)
    db.commit()
    return get_order(db, tenant_id, order_id)


def update_order(db: Session, tenant_id: str, order_id: str, payload: OrderUpdate) -> RestaurantOrder:
    order = get_order(db, tenant_id, order_id)
    _require_open(order)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(order, field, value)
    db.add(order)
    db.commit()
    return get_order(db, tenant_id, order_id)


def _get_item(db: Session, order: RestaurantOrder, item_id: str) -> RestaurantOrderItem:
    for item in order.items:
        if item.id == item_id:
            return item
    raise RestaurantError(404, "Order item not found.")


def update_item(db: Session, tenant_id: str, order_id: str, item_id: str, payload: OrderItemUpdate) -> RestaurantOrder:
    order = get_order(db, tenant_id, order_id)
    _require_open(order)
    item = _get_item(db, order, item_id)
    changes = payload.model_dump(exclude_unset=True)
    if "quantity" in changes and changes["quantity"] is not None:
        if changes["quantity"] < item.sent_quantity:
            # Reducing below what the kitchen is already cooking has to go through KOT
            # cancellation, otherwise the bill and the pass would silently disagree.
            raise RestaurantError(
                400,
                f"{item.product_name}: {item.sent_quantity:g} already sent to the kitchen. Cancel the KOT to reduce below that.",
            )
        item.quantity = changes["quantity"]
    if "notes" in changes:
        item.notes = changes["notes"]
    db.add(item)
    db.commit()
    return get_order(db, tenant_id, order_id)


def remove_item(db: Session, tenant_id: str, order_id: str, item_id: str) -> RestaurantOrder:
    order = get_order(db, tenant_id, order_id)
    _require_open(order)
    item = _get_item(db, order, item_id)
    if item.sent_quantity > 0:
        raise RestaurantError(
            400, f"{item.product_name} has already gone to the kitchen. Cancel its KOT instead of removing the line."
        )
    db.delete(item)
    db.commit()
    return get_order(db, tenant_id, order_id)


def cancel_order(db: Session, tenant_id: str, order_id: str) -> RestaurantOrder:
    order = get_order(db, tenant_id, order_id)
    _require_open(order)
    live_kots = [k for k in order.kots if k.status not in ("cancelled", "served")]
    if live_kots:
        raise RestaurantError(400, "This order has KOTs in the kitchen. Cancel them first.")
    order.status = "cancelled"
    order.closed_at = _now()
    db.add(order)
    if order.table_id:
        db.flush()
        sync_table_status(db, get_table(db, tenant_id, order.table_id))
    db.commit()
    return get_order(db, tenant_id, order_id)


def list_orders(
    db: Session, tenant_id: str, *, status: str | None = None, table_id: str | None = None, limit: int = 50
) -> list[RestaurantOrder]:
    stmt = select(RestaurantOrder).where(RestaurantOrder.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(RestaurantOrder.status == status)
    if table_id:
        stmt = stmt.where(RestaurantOrder.table_id == table_id)
    stmt = stmt.order_by(RestaurantOrder.created_at.desc()).limit(limit).options(
        selectinload(RestaurantOrder.items), selectinload(RestaurantOrder.kots).selectinload(Kot.items)
    )
    return list(db.execute(stmt).scalars())


def order_totals(order: RestaurantOrder) -> dict[str, float | int]:
    subtotal = 0.0
    tax_amount = 0.0
    count = 0
    for item in order.items:
        if item.is_cancelled:
            continue
        line = item.quantity * item.unit_price
        subtotal += line
        tax_amount += line * (item.tax_rate_percent or 0) / 100
        count += 1
    return {
        "subtotal": round(subtotal, 2),
        "tax_amount": round(tax_amount, 2),
        "total": round(subtotal + tax_amount, 2),
        "item_count": count,
    }


# ---- Table operations ------------------------------------------------------------------------

def transfer_order(db: Session, tenant_id: str, order_id: str, to_table_id: str) -> RestaurantOrder:
    order = get_order(db, tenant_id, order_id)
    _require_open(order)
    target = get_table(db, tenant_id, to_table_id)
    if order.table_id == target.id:
        raise RestaurantError(400, "That order is already on this table.")
    if _active_order_for_table(db, tenant_id, target.id):
        raise RestaurantError(409, f"Table {target.name} already has an open order.")

    source = get_table(db, tenant_id, order.table_id) if order.table_id else None
    order.table_id = target.id
    # A transferred takeaway becomes a dine-in order — it now has a table behind it.
    order.order_type = "dine_in"
    db.add(order)
    db.flush()
    sync_table_status(db, source)
    sync_table_status(db, target)
    db.commit()
    return get_order(db, tenant_id, order_id)


def merge_orders(db: Session, tenant_id: str, target_order_id: str, source_order_ids: list[str]) -> RestaurantOrder:
    target = get_order(db, tenant_id, target_order_id)
    _require_open(target)

    for source_id in source_order_ids:
        if source_id == target_order_id:
            raise RestaurantError(400, "An order cannot be merged into itself.")
        source = get_order(db, tenant_id, source_id)
        _require_open(source)

        for item in list(source.items):
            # Re-point rather than copy, so KotItem rows still resolve to a live order item and
            # the kitchen history of the merged table survives the merge.
            item.order_id = target.id
            db.add(item)
        for kot in list(source.kots):
            kot.order_id = target.id
            db.add(kot)

        source.status = "merged"
        source.merged_into_order_id = target.id
        source.closed_at = _now()
        db.add(source)
        if source.table_id:
            db.flush()
            sync_table_status(db, get_table(db, tenant_id, source.table_id))

    db.commit()
    return get_order(db, tenant_id, target_order_id)


def split_order(
    db: Session, tenant_id: str, order_id: str, current_user: User, selections: list[SplitItemSelection], to_table_id: str | None
) -> RestaurantOrder:
    order = get_order(db, tenant_id, order_id)
    _require_open(order)

    target_table: RestaurantTable | None = None
    if to_table_id:
        target_table = get_table(db, tenant_id, to_table_id)
        if _active_order_for_table(db, tenant_id, target_table.id):
            raise RestaurantError(409, f"Table {target_table.name} already has an open order.")

    new_order = RestaurantOrder(
        tenant_id=tenant_id,
        table_id=target_table.id if target_table else None,
        order_number=_next_sequence(db, RestaurantOrder, tenant_id, RestaurantOrder.order_number, "ORD"),
        order_type="dine_in" if target_table else "takeaway",
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        created_by=current_user.id,
    )
    db.add(new_order)
    db.flush()

    for selection in selections:
        item = _get_item(db, order, selection.order_item_id)
        if selection.quantity > item.quantity:
            raise RestaurantError(400, f"{item.product_name}: only {item.quantity:g} on the order.")
        # Split quantities are billed separately but were cooked once — the moved portion carries
        # its share of what the kitchen already made, so neither bill re-sends it.
        moved_sent = min(item.sent_quantity, selection.quantity)
        db.add(
            RestaurantOrderItem(
                order_id=new_order.id,
                product_id=item.product_id,
                product_name=item.product_name,
                identifier_value=item.identifier_value,
                quantity=selection.quantity,
                unit_price=item.unit_price,
                tax_rate_percent=item.tax_rate_percent,
                notes=item.notes,
                sent_quantity=moved_sent,
            )
        )
        item.quantity -= selection.quantity
        item.sent_quantity -= moved_sent
        if item.quantity <= 0:
            db.delete(item)
        else:
            db.add(item)

    sync_table_status(db, target_table)
    db.commit()
    return get_order(db, tenant_id, new_order.id)


# ---- KOT -------------------------------------------------------------------------------------

def create_kot(db: Session, tenant_id: str, order_id: str, current_user: User, payload: KotCreate) -> Kot:
    order = get_order(db, tenant_id, order_id)
    _require_open(order)

    if payload.items is None:
        # Default: everything not yet sent. This is the common "fire the order" action and the
        # one that cannot get quantities wrong.
        selections = [
            (item, item.quantity - item.sent_quantity)
            for item in order.items
            if not item.is_cancelled and item.quantity - item.sent_quantity > 0
        ]
    else:
        selections = []
        for chosen in payload.items:
            item = _get_item(db, order, chosen.order_item_id)
            remaining = item.quantity - item.sent_quantity
            if chosen.quantity > remaining:
                raise RestaurantError(
                    400, f"{item.product_name}: only {remaining:g} left to send to the kitchen."
                )
            selections.append((item, chosen.quantity))

    selections = [(item, qty) for item, qty in selections if qty > 0]
    if not selections:
        raise RestaurantError(400, "Everything on this order has already been sent to the kitchen.")

    kot = Kot(
        tenant_id=tenant_id,
        order_id=order.id,
        kot_number=_next_sequence(db, Kot, tenant_id, Kot.kot_number, "KOT"),
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(kot)
    db.flush()

    for item, qty in selections:
        db.add(
            KotItem(
                kot_id=kot.id,
                order_item_id=item.id,
                product_name=item.product_name,
                quantity=qty,
                notes=item.notes,
            )
        )
        item.sent_quantity += qty
        db.add(item)

    db.commit()
    return get_kot(db, tenant_id, kot.id)


def get_kot(db: Session, tenant_id: str, kot_id: str) -> Kot:
    kot = db.execute(
        select(Kot).where(Kot.tenant_id == tenant_id, Kot.id == kot_id).options(selectinload(Kot.items))
    ).scalar_one_or_none()
    if not kot:
        raise RestaurantError(404, "KOT not found.")
    return kot


def list_kots(db: Session, tenant_id: str, *, status: str | None = None, limit: int = 100) -> list[Kot]:
    stmt = select(Kot).where(Kot.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Kot.status == status)
    return list(
        db.execute(stmt.order_by(Kot.created_at.desc()).limit(limit).options(selectinload(Kot.items))).scalars()
    )


def set_kot_status(db: Session, tenant_id: str, kot_id: str, status: str) -> Kot:
    kot = get_kot(db, tenant_id, kot_id)
    allowed = KOT_TRANSITIONS.get(kot.status, ())
    if status == kot.status:
        return kot
    if status not in allowed:
        raise RestaurantError(400, f"A {kot.status} KOT cannot become {status}.")
    if status == "cancelled":
        raise RestaurantError(400, "Use the cancel endpoint so a reason is recorded.")
    kot.status = status
    db.add(kot)
    db.commit()
    return get_kot(db, tenant_id, kot_id)


def cancel_kot(db: Session, tenant_id: str, kot_id: str, current_user: User, reason: str) -> Kot:
    kot = get_kot(db, tenant_id, kot_id)
    if kot.status in ("cancelled", "served"):
        raise RestaurantError(400, f"This KOT is already {kot.status}.")

    kot.status = "cancelled"
    kot.cancel_reason = reason
    kot.cancelled_by = current_user.id
    kot.cancelled_at = _now()
    db.add(kot)

    # Cancelling returns the quantities to "not yet sent" so they can be re-fired or removed —
    # without this the items would stay billable but unreachable by any kitchen ticket.
    order = get_order(db, tenant_id, kot.order_id)
    by_id = {item.id: item for item in order.items}
    for kot_item in kot.items:
        item = by_id.get(kot_item.order_item_id)
        if item:
            item.sent_quantity = max(0.0, item.sent_quantity - kot_item.quantity)
            db.add(item)

    db.commit()
    return get_kot(db, tenant_id, kot_id)


def mark_kot_printed(db: Session, tenant_id: str, kot_id: str) -> Kot:
    """A reprint is a counter bump on the same KOT, never a new one — a second KOT would tell the
    kitchen to cook the food twice."""
    kot = get_kot(db, tenant_id, kot_id)
    kot.print_count += 1
    db.add(kot)
    db.commit()
    return get_kot(db, tenant_id, kot_id)


# ---- Billing ---------------------------------------------------------------------------------

def open_table_order(
    db: Session, tenant_id: str, current_user: User, table_id: str, items: list[OrderItemCreate]
) -> RestaurantOrder:
    """Get the table's open order, creating it if there isn't one, and append `items` to it.

    The "fire this to the kitchen now, bill it later" half of counter-side dine-in. Appending to
    the existing tab rather than opening a second order is the whole point: a table sends several
    rounds to the kitchen across one sitting, and they all have to land on one bill.
    """
    table = get_table(db, tenant_id, table_id)
    existing = _active_order_for_table(db, tenant_id, table.id)
    if existing:
        return add_items(db, tenant_id, existing.id, items) if items else existing
    return create_order(
        db,
        tenant_id,
        current_user,
        OrderCreate(order_type="dine_in", table_id=table_id, items=items),
    )


def quick_bill_table(
    db: Session, tenant_id: str, current_user: User, payload: TableQuickBillRequest
) -> Invoice:
    """Create the order for a table and bill it in one step.

    Deliberately built on the ordinary order + bill path rather than a shortcut into the invoice
    tables: a dine-in sale rung up at the counter has to leave exactly the same trail as one
    started from the table board — a real RestaurantOrder, the table's status synced, and one
    Invoice through the normal sales path — or table-wise reporting silently misses every sale
    taken this way.

    A table that already has an open tab gets the items appended to it and that tab billed, rather
    than a second order: create_order refuses an occupied table outright (two live orders on one
    table is the bug it prevents), so the existing one has to be found first.
    """
    table = get_table(db, tenant_id, payload.table_id)
    existing = _active_order_for_table(db, tenant_id, table.id)
    if existing:
        order = add_items(db, tenant_id, existing.id, payload.items)
    else:
        order = create_order(
            db,
            tenant_id,
            current_user,
            OrderCreate(
                order_type="dine_in",
                table_id=payload.table_id,
                customer_id=payload.customer_id,
                customer_name=payload.customer_name,
                customer_phone=payload.customer_phone,
                items=payload.items,
            ),
        )
    return bill_order(db, tenant_id, order.id, current_user, payload)


def bill_order(db: Session, tenant_id: str, order_id: str, current_user: User, payload: OrderBillRequest) -> Invoice:
    """Turns the order into exactly one Invoice through the normal sales path.

    Reusing `sales_service.create_invoice` rather than writing invoice rows here is what keeps
    dine-in revenue identical to counter revenue everywhere downstream — stock movement, tax,
    outstanding balances, analytics and the invoice PDF all behave the same way.
    """
    order = get_order(db, tenant_id, order_id)
    _require_open(order)

    lines = [
        InvoiceLineCreate(product_id=item.product_id, quantity=item.quantity, unit_price=item.unit_price)
        for item in order.items
        if not item.is_cancelled and item.quantity > 0
    ]
    if not lines:
        raise RestaurantError(400, "This order has no items to bill.")

    totals = order_totals(order)
    invoice_payload = InvoiceCreate(
        customer_id=order.customer_id,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        lines=lines,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        tax_percentage=payload.tax_percentage,
        payment_method=payload.payment_method,
        payment_reference=payload.payment_reference,
        amount_tendered=payload.amount_tendered,
        payment_type="paid" if payload.mark_paid else "credit",
        paid_now=float(totals["total"]) if payload.mark_paid else 0.0,
        idempotency_key=payload.client_reference_id,
    )
    invoice = sales_service.create_invoice(db, tenant_id, current_user, invoice_payload)

    order.invoice_id = invoice.id
    order.status = "billed"
    order.closed_at = _now()
    db.add(order)
    if order.table_id:
        db.flush()
        sync_table_status(db, get_table(db, tenant_id, order.table_id))
    db.commit()
    return invoice
