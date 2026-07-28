"""Static, platform-defined catalog of every feature/module RevGenIQ products can expose to a
tenant. This is deliberately code (not a DB table): the catalog describes what the *platform*
is capable of gating, which changes with deployments; what's tenant-specific (on/off, config,
who changed it) lives in `TenantFeatureFlag` and its history. Keeping the two separate is what
lets toggling a flag for a customer take effect with no deployment at all.
"""
from __future__ import annotations

from typing import Literal, TypedDict

Category = Literal["core", "business", "ai", "premium"]
ConfigFieldType = Literal["number", "boolean", "text"]
Domain = Literal["customers", "templates", "analytics", "general"]


class ConfigField(TypedDict):
    key: str
    label: str
    type: ConfigFieldType
    default: object


class FeatureModule(TypedDict):
    key: str
    label: str
    description: str
    category: Category
    domain: Domain
    is_implemented: bool
    always_on: bool
    requires: list[str]
    min_version: str
    config_schema: list[ConfigField]


def _m(
    key: str,
    label: str,
    description: str,
    category: Category,
    *,
    domain: Domain = "general",
    is_implemented: bool = False,
    always_on: bool = False,
    requires: list[str] | None = None,
    min_version: str = "1.0.0",
    config_schema: list[ConfigField] | None = None,
) -> FeatureModule:
    return {
        "key": key,
        "label": label,
        "description": description,
        "category": category,
        "domain": domain,
        "is_implemented": is_implemented,
        "always_on": always_on,
        "requires": requires or [],
        "min_version": min_version,
        "config_schema": config_schema or [],
    }


FEATURE_CATALOG: list[FeatureModule] = [
    # ---- Core Modules (real, shipped) ----
    _m("dashboard", "Overview", "The tenant's home overview screen.", "core", is_implemented=True, always_on=True),
    _m("pos_billing", "Billing", "Point-of-sale checkout and invoicing.", "core", is_implemented=True, config_schema=[
        {"key": "max_monthly_invoices", "label": "Maximum monthly invoices", "type": "number", "default": 1000},
        {"key": "thermal_printing", "label": "Thermal printing", "type": "boolean", "default": True},
        {"key": "credit_sales", "label": "Credit sales", "type": "boolean", "default": True},
        {"key": "discount_approval", "label": "Require discount approval", "type": "boolean", "default": False},
    ]),
    _m("customers", "Customers", "Retail customer directory and profiles.", "core", domain="customers", is_implemented=True, config_schema=[
        {"key": "max_customers", "label": "Maximum customers", "type": "number", "default": 500},
        {"key": "credit_tracking", "label": "Credit tracking", "type": "boolean", "default": True},
        {"key": "loyalty", "label": "Loyalty tracking", "type": "boolean", "default": False},
        {"key": "customer_ledger", "label": "Customer ledger", "type": "boolean", "default": True},
    ]),
    _m("products", "Products", "Product catalog management.", "core", is_implemented=True),
    _m("categories", "Categories", "Product category management.", "core", is_implemented=True),
    _m("inventory", "Inventory", "Stock levels and stock history.", "core", is_implemented=True, requires=["products"], config_schema=[
        {"key": "max_products", "label": "Maximum products", "type": "number", "default": 500},
        {"key": "max_warehouses", "label": "Maximum warehouses", "type": "number", "default": 1},
        {"key": "stock_alerts", "label": "Low-stock alerts", "type": "boolean", "default": True},
        {"key": "barcode_support", "label": "Barcode support", "type": "boolean", "default": False},
        {"key": "import_support", "label": "Bulk import", "type": "boolean", "default": True},
        {"key": "export_support", "label": "Bulk export", "type": "boolean", "default": True},
    ]),
    _m("returns", "Returns & Refunds", "Return and refund processing.", "core", is_implemented=True, requires=["pos_billing"]),
    _m("reports_analytics", "Reports", "Sales and performance reporting.", "core", is_implemented=True, config_schema=[
        {"key": "pdf_export", "label": "PDF export", "type": "boolean", "default": True},
        {"key": "excel_export", "label": "Excel export", "type": "boolean", "default": True},
        {"key": "advanced_reports", "label": "Advanced reports", "type": "boolean", "default": False},
        {"key": "analytics_dashboard", "label": "Analytics dashboard", "type": "boolean", "default": True},
    ]),
    _m("settings", "Settings", "Tenant business settings and preferences.", "core", is_implemented=True, always_on=True),
    _m("payments_credit", "Outstanding", "Outstanding balances and credit collection.", "core", is_implemented=True, requires=["pos_billing"]),
    _m("analytics", "Analytics", "Sales performance and business intelligence dashboards.", "core", domain="analytics", is_implemented=True),

    # ---- Business Modules (roadmap) ----
    _m("purchase", "Purchase", "Purchase order management.", "business"),
    _m("suppliers", "Suppliers", "Supplier directory and management.", "business"),
    _m("warehouse", "Warehouse", "Multi-warehouse stock management.", "business", requires=["inventory"]),
    _m("crm", "CRM", "Lead and pipeline management.", "business", requires=["customers"]),
    _m("marketing", "Marketing", "Campaigns and audience segmentation.", "business"),
    _m("loyalty", "Loyalty", "Points and rewards programs.", "business", domain="customers", requires=["customers"]),
    _m("expenses", "Expenses", "Business expense tracking.", "business"),
    _m("employees", "Employees", "Staff directory and roles.", "business"),
    _m("attendance", "Attendance", "Staff attendance tracking.", "business", requires=["employees"]),
    _m("payroll", "Payroll", "Salary processing.", "business", requires=["employees"]),
    _m("multi_branch", "Multi Branch", "Operate multiple business locations.", "business"),

    # ---- AI Features (roadmap) ----
    _m("ai_sales_assistant", "AI Sales Assistant", "Conversational sales guidance.", "ai"),
    _m("ai_dashboard", "AI Dashboard", "AI-summarized business overview.", "ai", requires=["reports_analytics"]),
    _m("ai_reports", "AI Reports", "Natural-language report generation.", "ai", requires=["reports_analytics"]),
    _m("ai_insights", "AI Insights", "Automated anomaly and trend detection.", "ai"),
    _m("ai_forecasting", "AI Forecasting", "Demand and stock forecasting.", "ai", requires=["inventory"]),
    _m("ai_product_recommendation", "AI Product Recommendation", "Cross-sell and upsell suggestions.", "ai", requires=["products"]),
    _m("ai_chat_assistant", "AI Chat Assistant", "In-app support chatbot.", "ai"),

    # ---- Premium Features ----
    _m("invoice_designer", "Invoice Designer", "Customizable invoice/receipt templates.", "premium", domain="templates", is_implemented=True, requires=["pos_billing"]),
    _m("whatsapp_integration", "WhatsApp Integration", "Send invoices via WhatsApp.", "premium"),
    _m("sms_integration", "SMS Integration", "Send notifications via SMS.", "premium"),
    _m("email_integration", "Email Integration", "Send invoices and receipts via email.", "premium"),
    _m("payment_gateway", "Payment Gateway", "Online payment collection.", "premium"),
    _m("barcode_printing", "Barcode Printing", "Print physical barcode labels.", "premium", requires=["inventory"]),
    _m("qr_payments", "QR Payments", "Accept payments via QR code.", "premium", requires=["payment_gateway"]),
    _m("api_access", "API Access", "Programmatic access via API keys.", "premium"),
    _m("custom_branding", "Custom Branding", "Upload a logo and brand the invoices.", "premium", is_implemented=True),
    _m("white_label", "White Label", "Remove RevGen BillIQ branding entirely.", "premium", requires=["custom_branding"]),
    _m("advanced_analytics", "Advanced Analytics", "Deeper analytics and trend charts.", "premium", domain="analytics", is_implemented=True, requires=["analytics"]),
    _m("trend_comparison", "Trend Comparison", "Period-over-period performance comparison.", "premium", domain="analytics", is_implemented=True, requires=["analytics"]),

    # ---- Customer sub-features (roadmap) ----
    _m("customer_groups", "Customer Groups", "Create and manage customer groups.", "business", domain="customers", requires=["customers"]),
    _m("customer_wallet", "Customer Wallet", "Store credit and prepaid wallet balances.", "business", domain="customers", requires=["customers"]),
    _m("customer_credit_limit", "Customer Credit", "Manage per-customer credit limits.", "business", domain="customers", requires=["customers"]),
    _m("customer_notes", "Customer Notes", "Add and manage customer notes.", "business", domain="customers", requires=["customers"]),
    _m("customer_import", "Customer Import", "Import customers from CSV / Excel.", "business", domain="customers", requires=["customers"]),
    _m("customer_export", "Customer Export", "Export customers to CSV / Excel.", "business", domain="customers", requires=["customers"]),
    _m("customer_kyc", "Customer KYC", "Collect and manage KYC documents.", "business", domain="customers", requires=["customers"]),
    _m("customer_blacklist", "Customer Blacklist", "Block and manage blacklisted customers.", "business", domain="customers", requires=["customers"]),

    # ---- Document template types (roadmap) ----
    _m("receipt_template", "Receipt Template", "Customizable receipt templates.", "premium", domain="templates", requires=["pos_billing"]),
    _m("kitchen_token_template", "Kitchen Token Template", "Customizable kitchen token templates.", "premium", domain="templates", requires=["pos_billing"]),
    _m("barcode_template", "Barcode Template", "Customizable barcode label templates.", "premium", domain="templates", requires=["pos_billing"]),
    _m("email_template", "Email Template", "Customizable transactional email templates.", "premium", domain="templates", requires=["pos_billing"]),
    _m("sms_template", "SMS Template", "Customizable SMS notification templates.", "premium", domain="templates", requires=["pos_billing"]),
    _m("whatsapp_template", "WhatsApp Template", "Customizable WhatsApp message templates.", "premium", domain="templates", requires=["pos_billing"]),

    # ---- Analytics sub-modules (roadmap) ----
    _m("sales_analytics", "Sales Analytics", "Deep-dive sales performance analytics.", "premium", domain="analytics", requires=["analytics"]),
    _m("customer_analytics", "Customer Analytics", "Customer behavior and segmentation analytics.", "premium", domain="analytics", requires=["analytics"]),
    _m("inventory_analytics", "Inventory Analytics", "Stock movement and turnover analytics.", "premium", domain="analytics", requires=["analytics"]),
    _m("tax_analytics", "Tax Analytics", "Tax collection and liability analytics.", "premium", domain="analytics", requires=["analytics"]),
    _m("payment_analytics", "Payment Analytics", "Payment method and collection analytics.", "premium", domain="analytics", requires=["analytics"]),
    _m("employee_analytics", "Employee Analytics", "Staff performance analytics.", "premium", domain="analytics", requires=["analytics"]),
]

FEATURE_BY_KEY: dict[str, FeatureModule] = {m["key"]: m for m in FEATURE_CATALOG}
ALL_MODULE_KEYS: set[str] = set(FEATURE_BY_KEY)

CATEGORY_LABELS: dict[Category, str] = {
    "core": "Core Modules",
    "business": "Business Modules",
    "ai": "AI Features",
    "premium": "Premium Features",
}

# Friendly plan names per the spec, mapped onto the plans that already exist in app.core.plans
# (Starter/Professional/Enterprise are how this module presents basic/explore/advance to admins;
# introducing genuinely new billing tiers is a much bigger change than feature management needs).
PLAN_DISPLAY_NAMES: dict[str, str] = {
    "basic": "Starter",
    "explore": "Professional",
    "advance": "Enterprise",
}

# What a plan recommends turning on by default. Modules not listed default to disabled. This is
# only ever a *recommendation* applied at reset/reactivation time — a tenant's live flags are
# always what's actually stored, so a plan change never silently changes an already-configured
# tenant's features out from under them.
_CORE_KEYS = [m["key"] for m in FEATURE_CATALOG if m["category"] == "core"]

PLAN_DEFAULT_MODULES: dict[str, list[str]] = {
    "basic": [*_CORE_KEYS],
    "explore": [*_CORE_KEYS, "invoice_designer", "custom_branding", "advanced_analytics", "trend_comparison"],
    "advance": [m["key"] for m in FEATURE_CATALOG],
}


def get_plan_defaults(plan: str) -> list[str]:
    return PLAN_DEFAULT_MODULES.get(plan, PLAN_DEFAULT_MODULES["basic"])


def get_dependents(module_key: str) -> list[str]:
    """Other catalog modules that declare `module_key` as a dependency."""
    return [m["key"] for m in FEATURE_CATALOG if module_key in m["requires"]]


def topo_order() -> list[str]:
    """Catalog keys ordered so a module always appears after everything it `requires`.

    Used when applying a template/reset in one shot so dependency modules get written
    (and therefore satisfy validation) before their dependents.
    """
    ordered: list[str] = []
    seen: set[str] = set()

    def visit(key: str) -> None:
        if key in seen or key not in FEATURE_BY_KEY:
            return
        seen.add(key)
        for req in FEATURE_BY_KEY[key]["requires"]:
            visit(req)
        ordered.append(key)

    for m in FEATURE_CATALOG:
        visit(m["key"])
    return ordered


def version_gte(version: str, minimum: str) -> bool:
    """Compare dotted version strings numerically (`2.10.0` > `2.9.0`), tolerant of junk."""

    def parts(v: str) -> tuple[int, ...]:
        out = []
        for chunk in v.split("."):
            digits = "".join(c for c in chunk if c.isdigit())
            out.append(int(digits) if digits else 0)
        return tuple(out)

    a, b = parts(version), parts(minimum)
    length = max(len(a), len(b))
    a = a + (0,) * (length - len(a))
    b = b + (0,) * (length - len(b))
    return a >= b
