from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TableStatus = Literal["available", "occupied", "reserved", "billing", "cleaning"]
OrderType = Literal["dine_in", "takeaway"]
OrderStatus = Literal["open", "billed", "cancelled", "merged"]
KotStatus = Literal["pending", "preparing", "ready", "served", "cancelled"]

# The kitchen lifecycle only ever moves forward, plus cancellation from any live state. Encoded
# here rather than in the router so both the API and any future kitchen-display client agree on
# what a legal transition is.
KOT_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "pending": ("preparing", "ready", "served", "cancelled"),
    "preparing": ("ready", "served", "cancelled"),
    "ready": ("served", "cancelled"),
    "served": (),
    "cancelled": (),
}


# ---- Floors ----

class FloorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sort_order: int = 0


class FloorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sort_order: int | None = None
    is_active: bool | None = None


class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    sort_order: int
    is_active: bool


# ---- Tables ----

class TableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    floor_id: str | None = None
    seats: int = Field(default=4, ge=1, le=100)
    sort_order: int = 0


class TableUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    floor_id: str | None = None
    seats: int | None = Field(default=None, ge=1, le=100)
    sort_order: int | None = None
    is_active: bool | None = None


class TableStatusUpdate(BaseModel):
    """Only the statuses a human sets directly. `occupied`/`billing` are consequences of the
    order on the table and are managed by the service, so allowing them here would let the board
    drift out of step with the actual orders."""

    status: Literal["available", "reserved", "cleaning"]


class TableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    floor_id: str | None = None
    seats: int
    status: TableStatus
    sort_order: int
    is_active: bool


class TableWithOrderOut(TableOut):
    """A table as the floor layout needs it: its own state plus a thin summary of whatever order
    is sitting on it, so the board renders in one request instead of N+1 per table."""

    active_order_id: str | None = None
    active_order_number: str | None = None
    active_order_total: float | None = None
    active_order_item_count: int | None = None
    active_order_opened_at: datetime | None = None


class FloorLayoutOut(BaseModel):
    floor: FloorOut | None = None
    tables: list[TableWithOrderOut]


# ---- Orders ----

class OrderItemCreate(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)
    # Optional override; when omitted the product's own selling price is used, so a caller can
    # never silently bill a stale price it read earlier.
    unit_price: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=500)


class OrderCreate(BaseModel):
    order_type: OrderType = "dine_in"
    table_id: str | None = None
    customer_id: str | None = None
    customer_name: str | None = Field(default=None, max_length=150)
    customer_phone: str | None = Field(default=None, max_length=50)
    guest_count: int | None = Field(default=None, ge=1)
    notes: str | None = Field(default=None, max_length=1000)
    items: list[OrderItemCreate] = Field(default_factory=list)


class OrderItemUpdate(BaseModel):
    quantity: float | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=500)


class OrderUpdate(BaseModel):
    customer_id: str | None = None
    customer_name: str | None = Field(default=None, max_length=150)
    customer_phone: str | None = Field(default=None, max_length=50)
    guest_count: int | None = Field(default=None, ge=1)
    notes: str | None = Field(default=None, max_length=1000)


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    product_name: str
    identifier_value: str | None = None
    quantity: float
    unit_price: float
    tax_rate_percent: float
    notes: str | None = None
    sent_quantity: float
    is_cancelled: bool
    line_total: float = 0.0


class OrderTotals(BaseModel):
    subtotal: float
    tax_amount: float
    total: float
    item_count: int


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_number: str
    order_type: OrderType
    status: OrderStatus
    table_id: str | None = None
    table_name: str | None = None
    customer_id: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    guest_count: int | None = None
    notes: str | None = None
    invoice_id: str | None = None
    merged_into_order_id: str | None = None
    created_at: datetime
    closed_at: datetime | None = None
    items: list[OrderItemOut] = Field(default_factory=list)
    totals: OrderTotals | None = None
    kots: list["KotOut"] = Field(default_factory=list)


# ---- Table operations ----

class TableTransferRequest(BaseModel):
    to_table_id: str


class TableMergeRequest(BaseModel):
    """Merge `source_order_ids` into this order. Items move across; the sources become `merged`
    and their tables are released."""

    source_order_ids: list[str] = Field(min_length=1)


class SplitItemSelection(BaseModel):
    order_item_id: str
    quantity: float = Field(gt=0)


class TableSplitRequest(BaseModel):
    """Move the selected item quantities off this order onto a new one, for separate billing."""

    items: list[SplitItemSelection] = Field(min_length=1)
    to_table_id: str | None = None


# ---- KOT ----

class KotItemSelection(BaseModel):
    order_item_id: str
    quantity: float = Field(gt=0)


class KotCreate(BaseModel):
    """Send items to the kitchen. Omit `items` to send everything not yet sent — the common case,
    and the one that can't get the quantities wrong."""

    items: list[KotItemSelection] | None = None
    notes: str | None = Field(default=None, max_length=500)


class KotStatusUpdate(BaseModel):
    status: KotStatus


class KotCancelRequest(BaseModel):
    # Required: a cancelled KOT means food may already be cooking, so the reason is the audit
    # trail for why it was pulled.
    reason: str = Field(min_length=1, max_length=500)


class KotItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_item_id: str
    product_name: str
    quantity: float
    notes: str | None = None


class KotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kot_number: str
    order_id: str
    status: KotStatus
    notes: str | None = None
    cancel_reason: str | None = None
    print_count: int
    created_at: datetime
    items: list[KotItemOut] = Field(default_factory=list)


class OrderBillRequest(BaseModel):
    """Turn the order into a real Invoice. Mirrors the POS checkout payload's money fields so a
    dine-in bill and a counter sale produce the same kind of invoice."""

    payment_method: Literal["cash", "card", "upi"] = "cash"
    payment_reference: str | None = Field(default=None, max_length=80)
    discount_type: Literal["flat", "percent"] | None = None
    discount_value: float = Field(default=0.0, ge=0)
    tax_percentage: float | None = Field(default=None, ge=0, le=100)
    amount_tendered: float | None = Field(default=None, ge=0)
    # Dine-in bills are frequently settled later (a running tab), so the caller can mark the
    # invoice unpaid and let the existing Outstanding flow collect it.
    mark_paid: bool = True
    client_reference_id: str | None = Field(default=None, max_length=64)


OrderOut.model_rebuild()
