from __future__ import annotations

from datetime import datetime

from app.modules.commerce.providers.base import CommerceProvider, ProviderOrder

_NOT_AVAILABLE = (
    "Swiggy live API integration requires Swiggy's POS-partner approval (a business/legal "
    "process, not something this app can enable on its own). Switch this integration's mode to "
    "'mock' until partner credentials are available."
)


class SwiggyProvider(CommerceProvider):
    """Structural stub matching CommerceProvider — implement each method against Swiggy's real
    Partner API once partner approval + credentials exist. Nothing else in the ingestion
    pipeline needs to change when that happens."""

    def __init__(self, api_key: str, api_secret: str, store_id: str | None) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.store_id = store_id

    def fetch_orders(self, since: datetime) -> list[ProviderOrder]:
        raise NotImplementedError(_NOT_AVAILABLE)

    def sync_menu(self) -> None:
        raise NotImplementedError(_NOT_AVAILABLE)

    def update_order_status(self, platform_order_id: str, status: str) -> None:
        raise NotImplementedError(_NOT_AVAILABLE)

    def verify_webhook(self, payload: bytes, signature: str | None) -> bool:
        raise NotImplementedError(_NOT_AVAILABLE)
