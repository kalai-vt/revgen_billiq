from __future__ import annotations

import random
from datetime import datetime, timezone
from uuid import uuid4

from app.modules.commerce.providers.base import CommerceProvider, ProviderOrder, ProviderOrderItem

_SAMPLE_ITEMS = [
    ("SKU-BURGER", "Cheese Burger", 149.0),
    ("SKU-PIZZA", "Margherita Pizza", 299.0),
    ("SKU-FRIES", "French Fries", 89.0),
    ("SKU-COKE", "Coke 500ml", 49.0),
    ("SKU-PASTA", "Alfredo Pasta", 219.0),
]

_SAMPLE_CUSTOMERS = ["Aarav Shah", "Priya Nair", "Rahul Verma", "Sneha Iyer", "Karan Mehta"]


class MockProvider(CommerceProvider):
    """Generates realistic-looking demo orders so the ingestion -> auto-invoice -> dashboard
    pipeline is fully exercisable without real Swiggy/Zomato partner API access."""

    def __init__(self, platform: str) -> None:
        self.platform = platform

    def generate_order(self, item_count: int = 2) -> ProviderOrder:
        chosen = random.sample(_SAMPLE_ITEMS, k=min(item_count, len(_SAMPLE_ITEMS)))
        items = [
            ProviderOrderItem(platform_sku=sku, item_name=name, quantity=float(random.randint(1, 3)), unit_price=price)
            for sku, name, price in chosen
        ]
        subtotal = round(sum(i.quantity * i.unit_price for i in items), 2)
        packaging_charge = 20.0
        tax_amount = round(subtotal * 0.05, 2)
        commission = round(subtotal * 0.20, 2)  # typical aggregator commission ballpark, for demo purposes
        total = round(subtotal + packaging_charge + tax_amount, 2)
        payout = round(total - commission, 2)
        return ProviderOrder(
            platform_order_id=f"MOCK-{uuid4().hex[:10].upper()}",
            status="placed",
            order_time=datetime.now(timezone.utc),
            customer_name=random.choice(_SAMPLE_CUSTOMERS),
            customer_phone=f"9{random.randint(100000000, 999999999)}",
            items=items,
            subtotal=subtotal,
            platform_discount=0.0,
            platform_commission=commission,
            packaging_charge=packaging_charge,
            tax_amount=tax_amount,
            total_amount=total,
            payout_amount=payout,
        )

    def fetch_orders(self, since: datetime) -> list[ProviderOrder]:
        return [self.generate_order()]

    def sync_menu(self) -> None:
        return None

    def update_order_status(self, platform_order_id: str, status: str) -> None:
        return None

    def verify_webhook(self, payload: bytes, signature: str | None) -> bool:
        return True
