from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ProviderOrderItem:
    platform_sku: str
    item_name: str
    quantity: float
    unit_price: float


@dataclass
class ProviderOrder:
    platform_order_id: str
    status: str
    order_time: datetime
    customer_name: str | None
    customer_phone: str | None
    items: list[ProviderOrderItem]
    subtotal: float
    platform_discount: float
    platform_commission: float
    packaging_charge: float
    tax_amount: float
    total_amount: float
    payout_amount: float
    items_extra: dict = field(default_factory=dict)


class CommerceProvider(ABC):
    """Uniform interface every platform integration implements, so wiring in a real Swiggy/Zomato
    connection later is a config-time swap-in rather than a rewrite of the ingestion pipeline.

    Swiggy and Zomato do not offer self-serve public APIs — real connectivity requires going
    through their POS-partner approval program (a business/legal process, not an engineering
    one). `MockProvider` implements this interface fully today so the whole pipeline (order
    ingestion -> auto-invoice -> dashboard) is genuinely testable and demoable without that
    approval; `SwiggyProvider`/`ZomatoProvider` are structural stubs that raise until real
    partner credentials are configured.
    """

    @abstractmethod
    def fetch_orders(self, since: datetime) -> list[ProviderOrder]:
        """Pull orders placed since the given timestamp."""

    @abstractmethod
    def sync_menu(self) -> None:
        """Push the tenant's product catalog to the platform."""

    @abstractmethod
    def update_order_status(self, platform_order_id: str, status: str) -> None:
        """Push an order status change (e.g. "preparing" -> "ready") back to the platform."""

    @abstractmethod
    def verify_webhook(self, payload: bytes, signature: str | None) -> bool:
        """Validate an inbound webhook's authenticity before trusting its payload."""
