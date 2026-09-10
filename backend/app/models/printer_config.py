"""Per-tenant printer destinations.

The billing printer's own configuration stays where it has always been, on `settings`
(`auto_print_*`) — moving it would break a working feature for every existing tenant to buy
nothing. This table is the *additional* destinations a tenant configures: the kitchen printer
today, a bar or tandoor printer later.

`role` rather than a boolean is what makes that later step a data change instead of a schema
change: adding a bar printer is a new row with role='bar'. `category_id` is nullable and unused by
the current UI for the same reason — it is the hook for "drinks go to the bar printer" routing,
so that arrives without a migration.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# Destinations a print job can be routed to. 'kot' is the only one the UI configures today.
PRINTER_ROLES = ("kot", "bar", "tandoor", "label")

# USB and Bluetooth reach the printer from the browser. LAN and Wi-Fi need a raw TCP socket to
# port 9100, which no browser API can open — those route through the Print Agent's NetworkAdapter,
# and are stored here but not yet selectable in the UI.
CONNECTION_TYPES = ("usb", "lan", "wifi", "bluetooth")

# Never "connected" until a test actually reached the printer — a claimed connection that has
# never been proven is worse than an unknown one, because staff stop checking.
CONNECTION_STATUSES = ("unconfigured", "untested", "connected", "failed")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PrinterConfiguration(Base):
    __tablename__ = "printer_configurations"
    __table_args__ = (
        # One configuration per role per tenant. The unique constraint is what stops a second
        # kitchen printer quietly appearing and splitting tickets between two devices.
        UniqueConstraint("tenant_id", "role", name="uq_printer_configurations_tenant_role"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="kot", index=True)

    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    printer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    connection_type: Mapped[str] = mapped_column(String(20), default="usb")

    # Network (LAN/Wi-Fi). Nullable because a USB printer has neither.
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Device handles for the browser-reachable transports.
    usb_device_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bluetooth_device_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    paper_width: Mapped[str] = mapped_column(String(10), default="80mm")
    copies: Mapped[int] = mapped_column(Integer, default=1)
    auto_print: Mapped[bool] = mapped_column(Boolean, default=True)

    # Which optional lines the ticket carries (restaurant name, table number, ...). JSON rather
    # than a column each, because these are presentation toggles that will keep growing and none
    # of them is ever queried on.
    ticket_fields: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Future per-category routing (drinks -> bar). Unused today; see the module docstring.
    category_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Proof of reachability, not a guess: only a successful test sets 'connected'.
    connection_status: Mapped[str] = mapped_column(String(20), default="unconfigured")
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


DEFAULT_TICKET_FIELDS: dict[str, bool] = {
    "restaurant_name": True,
    "table_number": True,
    "kot_number": True,
    "date_time": True,
    "customer_name": False,
    "order_notes": True,
}
