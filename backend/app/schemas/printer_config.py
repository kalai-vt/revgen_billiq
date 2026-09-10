from __future__ import annotations

import ipaddress
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PrinterRole = Literal["kot", "bar", "tandoor", "label"]
ConnectionType = Literal["usb", "lan", "wifi", "bluetooth"]
ConnectionStatus = Literal["unconfigured", "untested", "connected", "failed"]

# LAN and Wi-Fi are the same wire protocol — a raw socket to the printer's port. They are kept as
# separate choices only because that is how the person setting up the restaurant thinks about it.
NETWORK_TYPES = ("lan", "wifi")


class TicketFields(BaseModel):
    """Which optional lines the kitchen ticket carries."""

    restaurant_name: bool = True
    table_number: bool = True
    kot_number: bool = True
    date_time: bool = True
    customer_name: bool = False
    order_notes: bool = True


class PrinterConfigurationUpdate(BaseModel):
    enabled: bool | None = None
    printer_name: str | None = Field(default=None, max_length=255)
    connection_type: ConnectionType | None = None
    ip_address: str | None = Field(default=None, max_length=45)
    port: int | None = Field(default=None, ge=1, le=65535)
    usb_device_id: str | None = Field(default=None, max_length=255)
    bluetooth_device_id: str | None = Field(default=None, max_length=255)
    paper_width: Literal["58mm", "80mm"] | None = None
    copies: int | None = Field(default=None, ge=1, le=5)
    auto_print: bool | None = None
    ticket_fields: TicketFields | None = None

    @field_validator("ip_address")
    @classmethod
    def _valid_ip(cls, value: str | None) -> str | None:
        """A typo'd address is a printer that silently never prints, so reject it at the door
        rather than at 8pm on a Friday."""
        if value is None or not value.strip():
            return None
        try:
            ipaddress.ip_address(value.strip())
        except ValueError:
            raise ValueError("Enter a valid IP address, for example 192.168.1.102.") from None
        return value.strip()

    @model_validator(mode="after")
    def _network_needs_an_address(self) -> "PrinterConfigurationUpdate":
        # Only enforced when the caller is actually switching to a network type — a partial update
        # that just flips `enabled` must not be rejected for an address it never mentioned.
        if self.connection_type in NETWORK_TYPES and self.enabled and not self.ip_address:
            raise ValueError("A network printer needs an IP address.")
        return self


class PrinterConfigurationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: PrinterRole
    enabled: bool
    printer_name: str | None
    connection_type: ConnectionType
    ip_address: str | None
    port: int | None
    usb_device_id: str | None
    bluetooth_device_id: str | None
    paper_width: str
    copies: int
    auto_print: bool
    ticket_fields: TicketFields
    connection_status: ConnectionStatus
    last_tested_at: datetime | None
    last_test_error: str | None


class ConnectionTestResult(BaseModel):
    """Reported by the client after it actually tried to reach the printer.

    The browser owns the USB/Bluetooth connection, so only it knows whether the printer answered —
    the server records the outcome rather than inventing it. This is why `connected` can never be
    set by simply saving a form.
    """

    ok: bool
    error: str | None = Field(default=None, max_length=500)
