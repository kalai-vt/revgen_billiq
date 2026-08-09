from __future__ import annotations

from typing import TypedDict


class PlanFeatures(TypedDict):
    whatsapp_invoice: bool
    advanced_analytics: bool
    user_management: bool
    barcode_support: bool


class PlanConfig(TypedDict):
    label: str
    price_inr: int
    max_users: int | None
    max_products: int | None
    max_customers: int | None
    max_monthly_invoices: int | None
    max_branches: int | None
    max_warehouses: int | None
    max_storage_mb: int | None
    features: PlanFeatures


# Three tiers: BASIC, ADVANCED, CUSTOM (stable ids: "basic", "advance", "custom" — kept as the
# existing short ids rather than renamed to avoid a wider string-literal rename across the admin
# portal/DB; only the *label* changed to match the new naming). A prior 4th tier, "explore", has
# been folded into "advance": every tenant previously on "explore" is upgraded (never downgraded)
# to "advance" by migration db26f1a4e938_collapse_explore_into_advance_plan — advance was already
# a superset of explore's features/limits, so this changes no tenant's available functionality,
# only what their plan is labeled. "custom" has no fixed price: it's admin-configured per tenant
# (see PHASE 7-10 of the trial/subscription spec) rather than a self-serve payable tier, so
# price_inr is 0 and Razorpay checkout for it is intentionally not offered (see
# app/modules/subscription_billing/service.py).
PLANS: dict[str, PlanConfig] = {
    "basic": {
        "label": "Basic",
        "price_inr": 999,
        "max_users": 1,
        "max_products": 500,
        "max_customers": 500,
        "max_monthly_invoices": None,
        "max_branches": 1,
        "max_warehouses": 1,
        "max_storage_mb": 1024,
        "features": {
            "whatsapp_invoice": False,
            "advanced_analytics": False,
            "user_management": False,
            "barcode_support": True,
        },
    },
    "advance": {
        "label": "Advanced",
        "price_inr": 2999,
        "max_users": None,
        "max_products": None,
        "max_customers": None,
        "max_monthly_invoices": None,
        "max_branches": None,
        "max_warehouses": None,
        "max_storage_mb": None,
        "features": {
            "whatsapp_invoice": True,
            "advanced_analytics": True,
            "user_management": True,
            "barcode_support": True,
        },
    },
    "custom": {
        "label": "Custom",
        "price_inr": 0,
        "max_users": None,
        "max_products": None,
        "max_customers": None,
        "max_monthly_invoices": None,
        "max_branches": None,
        "max_warehouses": None,
        "max_storage_mb": None,
        "features": {
            "whatsapp_invoice": True,
            "advanced_analytics": True,
            "user_management": True,
            "barcode_support": True,
        },
    },
}

PLAN_IDS: tuple[str, ...] = ("basic", "advance", "custom")


def get_plan(plan_id: str) -> PlanConfig:
    return PLANS.get(plan_id, PLANS["basic"])
