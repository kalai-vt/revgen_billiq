"""Dine-in table service: floors, tables, orders, and Kitchen Order Tickets.

The whole module is built around one chain:

    Table -> Order -> KOT -> Invoice -> Payment

A `RestaurantOrder` belongs to a table and accumulates items over the life of the sitting. A
`Kot` is a *subset* of that order's items sent to the kitchen at one point in time — the second
round of drinks is a second KOT against the same order, never a second order. Billing generates
an ordinary `Invoice` from the order and stores its id here, so an invoice is never a separate,
independent sale that reporting has to guess at. That single chain is what makes table-wise
sales, KOT timing, and "which invoice came from which table" auditable.

Why a new order model rather than reusing what exists: `Invoice` is single-shot (it is created
complete at checkout, defaulting to status/payment_status "paid"), and `HeldBill` stores its cart
as an opaque JSON blob, so neither can carry per-item kitchen state that a KOT has to reference.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# A table is Occupied/Billing because of the order sitting on it, but Reserved and Cleaning have
# no order behind them at all — they are deliberate staff choices. So the column is the stored
# source of truth and the service keeps it in step with order state (see restaurant/service.py's
# `sync_table_status`), rather than the UI hard-coding a status per screen.
TABLE_STATUSES = ("available", "occupied", "reserved", "billing", "cleaning")

ORDER_TYPES = ("dine_in", "takeaway")
# `merged` is terminal like billed/cancelled: the order's items now live on the target order, and
# it is kept only so the merge stays auditable rather than deleting history.
ORDER_STATUSES = ("open", "billed", "cancelled", "merged")

KOT_STATUSES = ("pending", "preparing", "ready", "served", "cancelled")


class RestaurantFloor(Base):
    __tablename__ = "restaurant_floors"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_restaurant_floors_tenant_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class RestaurantTable(Base):
    __tablename__ = "restaurant_tables"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_restaurant_tables_tenant_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    floor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("restaurant_floors.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(50))
    seats: Mapped[int] = mapped_column(Integer, default=4)
    status: Mapped[str] = mapped_column(String(20), default="available", index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class RestaurantOrder(Base):
    __tablename__ = "restaurant_orders"
    __table_args__ = (UniqueConstraint("tenant_id", "order_number", name="uq_restaurant_orders_tenant_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    # Null for takeaway — a takeaway order is the same order/KOT flow without a table behind it.
    table_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("restaurant_tables.id"), nullable=True, index=True)
    order_number: Mapped[str] = mapped_column(String(30), index=True)
    order_type: Mapped[str] = mapped_column(String(20), default="dine_in")
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    guest_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set when the order is billed. This is the Order -> Invoice link the whole chain depends on:
    # the invoice is generated *from* this order, never as an independent second sale.
    invoice_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("invoices.id"), nullable=True, index=True)
    # Set when this order was merged into another one, so a merge stays auditable both ways.
    merged_into_order_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("restaurant_orders.id"), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["RestaurantOrderItem"]] = relationship(cascade="all, delete-orphan")
    kots: Mapped[list["Kot"]] = relationship(cascade="all, delete-orphan")


class RestaurantOrderItem(Base):
    __tablename__ = "restaurant_order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurant_orders.id"), index=True)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(200))
    identifier_value: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)
    tax_rate_percent: Mapped[float] = mapped_column(Float, default=0.0)
    # Kitchen notes for this line ("no onion"), printed on the KOT rather than the bill.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # How many of `quantity` have already gone to the kitchen on some KOT. Adding 2 more of an
    # item that was already sent means only the 2 new ones belong on the next KOT, so this is
    # tracked per line rather than assuming a whole line is sent at once.
    sent_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Kot(Base):
    __tablename__ = "kots"
    __table_args__ = (UniqueConstraint("tenant_id", "kot_number", name="uq_kots_tenant_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurant_orders.id"), index=True)
    kot_number: Mapped[str] = mapped_column(String(30), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # A reprint is not a new KOT (that would double-send the food) — it's a counter on this one,
    # kept so "the kitchen never got it" can be told apart from "it was printed three times".
    print_count: Mapped[int] = mapped_column(Integer, default=0)
    # How the last print attempt actually went. A ticket that failed to print stays 'failed' and
    # retryable rather than disappearing — the kitchen not knowing about the food is the failure
    # this guards against, and it is worse than a duplicate ticket.
    print_status: Mapped[str] = mapped_column(String(20), default="pending")
    last_print_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    items: Mapped[list["KotItem"]] = relationship(cascade="all, delete-orphan")


class KotItem(Base):
    __tablename__ = "kot_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    kot_id: Mapped[str] = mapped_column(String(36), ForeignKey("kots.id"), index=True)
    order_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurant_order_items.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[float] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
