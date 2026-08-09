"""Single source of truth for which optional elements the Billing checkout screen can show, and
what a tenant is allowed to turn on/off. Settings > Billing Settings > Checkout Elements reads
this catalog to render its toggles; POSPage reads the resolved per-tenant config to decide what to
render. Adding a future element (Coupon, Loyalty, Gift Card, Service Charge, Table, Waiter, ...) is
just one more entry here — no schema migration, no new endpoint, no scattered conditionals to hunt
down elsewhere.

Total and Checkout are deliberately NOT in this registry — they're mandatory and always render;
giving them a toggle would let a tenant configure away the ability to complete a sale.
"""
from __future__ import annotations

from typing import Literal, TypedDict

CheckoutElementGroup = Literal["customer_info", "pricing", "payment_type", "payment_method", "cashier_tools"]

GROUP_LABELS: dict[CheckoutElementGroup, str] = {
    "customer_info": "Customer Info",
    "pricing": "Pricing",
    "payment_type": "Payment Type",
    "payment_method": "Payment Method",
    "cashier_tools": "Cashier Tools",
}


class CheckoutElement(TypedDict):
    key: str
    label: str
    group: CheckoutElementGroup
    default: bool
    # Module key (see app/core/feature_catalog.py) this element additionally depends on, if any.
    # The element only ever shows when BOTH this module is enabled for the tenant AND the
    # tenant's own checkout-element setting for it is on.
    depends_on_module: str | None


def _e(
    key: str, label: str, group: CheckoutElementGroup, *, default: bool = True, depends_on_module: str | None = None
) -> CheckoutElement:
    return {"key": key, "label": label, "group": group, "default": default, "depends_on_module": depends_on_module}


# Safe defaults: every element defaults to True, matching the app's existing hard-coded-on
# behavior before this feature existed — a tenant who never visits the new settings page keeps
# exactly the checkout they have today.
CHECKOUT_ELEMENT_REGISTRY: list[CheckoutElement] = [
    _e("customer", "Customer", "customer_info"),
    _e("phone", "Phone", "customer_info"),
    _e("discount", "Discount", "pricing"),
    _e("tax", "Tax", "pricing"),
    _e("paid_in_full", "Paid in Full", "payment_type"),
    _e("partially_paid", "Partially Paid", "payment_type", depends_on_module="payments_credit"),
    _e("credit", "Credit (Pay Later)", "payment_type", depends_on_module="payments_credit"),
    _e("cash", "Cash", "payment_method"),
    _e("card", "Card", "payment_method"),
    _e("upi", "UPI", "payment_method"),
    _e("amount_tendered", "Amount Tendered", "cashier_tools"),
    _e("change_due", "Change Due", "cashier_tools"),
    _e("hold_bill", "Hold Bill", "cashier_tools"),
]

CHECKOUT_ELEMENT_BY_KEY: dict[str, CheckoutElement] = {e["key"]: e for e in CHECKOUT_ELEMENT_REGISTRY}
CHECKOUT_ELEMENT_KEYS: set[str] = set(CHECKOUT_ELEMENT_BY_KEY)

DEFAULT_CHECKOUT_CONFIG: dict[str, bool] = {e["key"]: e["default"] for e in CHECKOUT_ELEMENT_REGISTRY}


def resolve_checkout_config(stored: dict[str, bool] | None) -> dict[str, bool]:
    """Merges a tenant's stored overrides (possibly missing keys — an old tenant predating a
    newly added element, or one that's never touched this page at all) with registry defaults.
    Unknown keys in `stored` (e.g. a since-removed element) are dropped rather than surfaced."""
    stored = stored or {}
    return {key: stored.get(key, default) for key, default in DEFAULT_CHECKOUT_CONFIG.items()}
