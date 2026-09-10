from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.limits import require_feature
from app.core.responses import make_response
from app.models.restaurant import RestaurantOrder
from app.models.user import User
from app.modules.restaurant import service
from app.modules.restaurant.service import RestaurantError
from app.schemas.restaurant import (
    FloorCreate,
    FloorLayoutOut,
    FloorOut,
    FloorUpdate,
    KotCancelRequest,
    KotCreate,
    KotOut,
    KotStatusUpdate,
    OrderBillRequest,
    OrderCreate,
    OrderItemCreate,
    OrderItemUpdate,
    OrderOut,
    OrderTotals,
    OrderUpdate,
    TableCreate,
    TableMergeRequest,
    TableOut,
    TableSplitRequest,
    TableStatusUpdate,
    TableTransferRequest,
    TableUpdate,
    TableWithOrderOut,
)

router = APIRouter(prefix="/api/restaurant", tags=["restaurant"], dependencies=[Depends(require_feature("restaurant"))])


def _handle(err: RestaurantError) -> HTTPException:
    return HTTPException(status_code=err.status_code, detail=err.message)


def _order_out(db: Session, order: RestaurantOrder) -> dict[str, Any]:
    totals = service.order_totals(order)
    table_name = None
    if order.table_id:
        try:
            table_name = service.get_table(db, order.tenant_id, order.table_id).name
        except RestaurantError:
            table_name = None
    out = OrderOut.model_validate(order)
    out.table_name = table_name
    out.totals = OrderTotals(**totals)  # type: ignore[arg-type]
    for item, model in zip(out.items, order.items):
        item.line_total = round(model.quantity * model.unit_price, 2)
    return out.model_dump(mode="json")


# ---- Floors ----

@router.get("/floors")
def get_floors(
    include_inactive: bool = False,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    floors = service.list_floors(db, current_user.tenant_id, include_inactive=include_inactive)
    return make_response(True, "Floors loaded", [FloorOut.model_validate(f).model_dump(mode="json") for f in floors])


@router.post("/floors", dependencies=[Depends(require_feature("floor_management"))])
def post_floor(
    payload: FloorCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        floor = service.create_floor(db, current_user.tenant_id, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Floor created", FloorOut.model_validate(floor).model_dump(mode="json"))


@router.put("/floors/{floor_id}", dependencies=[Depends(require_feature("floor_management"))])
def put_floor(
    floor_id: str,
    payload: FloorUpdate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        floor = service.update_floor(db, current_user.tenant_id, floor_id, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Floor updated", FloorOut.model_validate(floor).model_dump(mode="json"))


@router.delete("/floors/{floor_id}", dependencies=[Depends(require_feature("floor_management"))])
def delete_floor(
    floor_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        service.delete_floor(db, current_user.tenant_id, floor_id)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Floor deleted", None)


# ---- Tables ----

@router.get("/tables")
def get_tables(
    floor_id: str | None = None,
    include_inactive: bool = False,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    tables = service.list_tables(db, current_user.tenant_id, floor_id=floor_id, include_inactive=include_inactive)
    return make_response(True, "Tables loaded", [TableOut.model_validate(t).model_dump(mode="json") for t in tables])


@router.get("/layout")
def get_layout(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """The floor board: every floor, its tables, and the open order on each — one request, so the
    layout screen never fans out per table."""
    grouped = service.floor_layout(db, current_user.tenant_id)
    payload = []
    for floor, rows in grouped:
        tables = []
        for table, order in rows:
            out = TableWithOrderOut.model_validate(table)
            if order:
                totals = service.order_totals(order)
                out.active_order_id = order.id
                out.active_order_number = order.order_number
                out.active_order_total = float(totals["total"])
                out.active_order_item_count = int(totals["item_count"])
                out.active_order_opened_at = order.created_at
            tables.append(out)
        payload.append(
            FloorLayoutOut(
                floor=FloorOut.model_validate(floor) if floor else None, tables=tables
            ).model_dump(mode="json")
        )
    return make_response(True, "Layout loaded", payload)


@router.post("/tables", dependencies=[Depends(require_feature("table_management"))])
def post_table(
    payload: TableCreate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        table = service.create_table(db, current_user.tenant_id, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Table created", TableOut.model_validate(table).model_dump(mode="json"))


@router.put("/tables/{table_id}", dependencies=[Depends(require_feature("table_management"))])
def put_table(
    table_id: str,
    payload: TableUpdate,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        table = service.update_table(db, current_user.tenant_id, table_id, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Table updated", TableOut.model_validate(table).model_dump(mode="json"))


@router.put("/tables/{table_id}/status")
def put_table_status(
    table_id: str,
    payload: TableStatusUpdate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        table = service.set_table_status(db, current_user.tenant_id, table_id, payload.status)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Table updated", TableOut.model_validate(table).model_dump(mode="json"))


@router.delete("/tables/{table_id}", dependencies=[Depends(require_feature("table_management"))])
def delete_table(
    table_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        service.delete_table(db, current_user.tenant_id, table_id)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Table deleted", None)


# ---- Orders ----

@router.get("/orders")
def get_orders(
    status: Literal["open", "billed", "cancelled", "merged"] | None = None,
    table_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    orders = service.list_orders(db, current_user.tenant_id, status=status, table_id=table_id, limit=limit)
    return make_response(True, "Orders loaded", [_order_out(db, o) for o in orders])


@router.post("/orders")
def post_order(
    payload: OrderCreate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.create_order(db, current_user.tenant_id, current_user, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Order created", _order_out(db, order))


@router.get("/orders/{order_id}")
def get_order(
    order_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.get_order(db, current_user.tenant_id, order_id)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Order loaded", _order_out(db, order))


@router.put("/orders/{order_id}")
def put_order(
    order_id: str,
    payload: OrderUpdate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.update_order(db, current_user.tenant_id, order_id, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Order updated", _order_out(db, order))


@router.post("/orders/{order_id}/items")
def post_order_items(
    order_id: str,
    payload: list[OrderItemCreate],
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.add_items(db, current_user.tenant_id, order_id, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Items added", _order_out(db, order))


@router.put("/orders/{order_id}/items/{item_id}")
def put_order_item(
    order_id: str,
    item_id: str,
    payload: OrderItemUpdate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.update_item(db, current_user.tenant_id, order_id, item_id, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Item updated", _order_out(db, order))


@router.delete("/orders/{order_id}/items/{item_id}")
def delete_order_item(
    order_id: str,
    item_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.remove_item(db, current_user.tenant_id, order_id, item_id)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Item removed", _order_out(db, order))


@router.post("/orders/{order_id}/cancel")
def post_cancel_order(
    order_id: str,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.cancel_order(db, current_user.tenant_id, order_id)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Order cancelled", _order_out(db, order))


@router.post("/orders/{order_id}/transfer", dependencies=[Depends(require_feature("table_transfer"))])
def post_transfer(
    order_id: str,
    payload: TableTransferRequest,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.transfer_order(db, current_user.tenant_id, order_id, payload.to_table_id)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Order transferred", _order_out(db, order))


@router.post("/orders/{order_id}/merge", dependencies=[Depends(require_feature("table_merge"))])
def post_merge(
    order_id: str,
    payload: TableMergeRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.merge_orders(db, current_user.tenant_id, order_id, payload.source_order_ids)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Orders merged", _order_out(db, order))


@router.post("/orders/{order_id}/split", dependencies=[Depends(require_feature("table_split"))])
def post_split(
    order_id: str,
    payload: TableSplitRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        order = service.split_order(
            db, current_user.tenant_id, order_id, current_user, payload.items, payload.to_table_id
        )
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Order split", _order_out(db, order))


@router.post("/orders/{order_id}/bill")
def post_bill(
    order_id: str,
    payload: OrderBillRequest,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        invoice = service.bill_order(db, current_user.tenant_id, order_id, current_user, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Order billed", {"invoice_id": invoice.id, "invoice_number": invoice.invoice_number})


# ---- KOT ----

@router.get("/kots", dependencies=[Depends(require_feature("kot"))])
def get_kots(
    status: Literal["pending", "preparing", "ready", "served", "cancelled"] | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    kots = service.list_kots(db, current_user.tenant_id, status=status, limit=limit)
    return make_response(True, "KOTs loaded", [KotOut.model_validate(k).model_dump(mode="json") for k in kots])


@router.post("/orders/{order_id}/kot", dependencies=[Depends(require_feature("kot"))])
def post_kot(
    order_id: str,
    payload: KotCreate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        kot = service.create_kot(db, current_user.tenant_id, order_id, current_user, payload)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "Sent to kitchen", KotOut.model_validate(kot).model_dump(mode="json"))


@router.put("/kots/{kot_id}/status", dependencies=[Depends(require_feature("kot"))])
def put_kot_status(
    kot_id: str,
    payload: KotStatusUpdate,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        kot = service.set_kot_status(db, current_user.tenant_id, kot_id, payload.status)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "KOT updated", KotOut.model_validate(kot).model_dump(mode="json"))


@router.post("/kots/{kot_id}/cancel", dependencies=[Depends(require_feature("kot"))])
def post_cancel_kot(
    kot_id: str,
    payload: KotCancelRequest,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        kot = service.cancel_kot(db, current_user.tenant_id, kot_id, current_user, payload.reason)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "KOT cancelled", KotOut.model_validate(kot).model_dump(mode="json"))


@router.post("/kots/{kot_id}/printed", dependencies=[Depends(require_feature("kot"))])
def post_kot_printed(
    kot_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        kot = service.mark_kot_printed(db, current_user.tenant_id, kot_id)
    except RestaurantError as err:
        raise _handle(err) from err
    return make_response(True, "KOT reprinted", KotOut.model_validate(kot).model_dump(mode="json"))
