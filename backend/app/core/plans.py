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
    "explore": {
        "label": "Explore",
        "price_inr": 1999,
        "max_users": 5,
        "max_products": None,
        "max_customers": None,
        "max_monthly_invoices": None,
        "max_branches": 3,
        "max_warehouses": 3,
        "max_storage_mb": 10240,
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


def get_plan(plan_id: str) -> PlanConfig:
    return PLANS.get(plan_id, PLANS["basic"])
