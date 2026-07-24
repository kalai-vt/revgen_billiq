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
    features: PlanFeatures


PLANS: dict[str, PlanConfig] = {
    "basic": {
        "label": "Basic",
        "price_inr": 999,
        "max_users": 1,
        "max_products": 500,
        "max_customers": 500,
        "max_monthly_invoices": 1000,
        "max_branches": 1,
        "features": {
            "whatsapp_invoice": False,
            "advanced_analytics": False,
            "user_management": False,
            "barcode_support": False,
        },
    },
    "explore": {
        "label": "Explore",
        "price_inr": 1999,
        "max_users": 10,
        "max_products": 10000,
        "max_customers": None,
        "max_monthly_invoices": None,
        "max_branches": 3,
        "features": {
            "whatsapp_invoice": True,
            "advanced_analytics": True,
            "user_management": True,
            "barcode_support": True,
        },
    },
    "advance": {
        "label": "Advance",
        "price_inr": 2999,
        "max_users": None,
        "max_products": None,
        "max_customers": None,
        "max_monthly_invoices": None,
        "max_branches": None,
        "features": {
            "whatsapp_invoice": True,
            "advanced_analytics": True,
            "user_management": True,
            "barcode_support": True,
        },
    },
}


def get_plan(plan_id: str) -> PlanConfig:
    return PLANS.get(plan_id, PLANS["basic"])
