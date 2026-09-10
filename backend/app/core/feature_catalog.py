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
Domain = Literal["customers", "templates", "analytics", "general", "procurement", "commerce", "restaurant"]


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
    _m("activity_log", "Activity Log", "Audit trail of who changed what and when.", "core", is_implemented=True),

    # ---- Procurement Management (implemented in phases; sub-keys pre-registered so the admin
    # portal's Procurement tab is complete from day one — flip is_implemented as each phase ships) ----
    _m("procurement", "Procurement", "Vendor purchasing, costs, and payables.", "business", domain="procurement", is_implemented=True),
    _m("vendors", "Vendors", "Vendor directory and outstanding balances.", "business", domain="procurement", is_implemented=True, requires=["procurement"]),
    _m("purchase_entries", "Purchase Entry", "Record vendor purchases; updates stock and cost price.", "business", domain="procurement", is_implemented=True, requires=["procurement", "vendors"]),
    _m("purchase_returns", "Purchase Returns", "Return purchased stock to a vendor.", "business", domain="procurement", is_implemented=True, requires=["procurement", "purchase_entries"]),
    _m("vendor_payments", "Vendor Payments", "Record payments made against vendor purchases.", "business", domain="procurement", is_implemented=True, requires=["procurement", "vendors"]),
    _m("procurement_analytics", "Procurement Analytics", "Purchase trends, vendor and cost analysis, margin.", "business", domain="procurement", is_implemented=True, requires=["procurement"]),
    _m("procurement_reports", "Procurement Reports", "Purchase, vendor, and GST reports with export.", "business", domain="procurement", is_implemented=True, requires=["procurement"]),

    # ---- Commerce Integrations (Swiggy/Zomato online-order sync). Real platform connectivity
    # requires each platform's POS-partner approval — until then, integrations run in "mock"
    # mode so the full order -> auto-invoice -> dashboard pipeline is genuinely usable today. ----
    _m("commerce", "Commerce Integrations", "Online-order sync from delivery platforms.", "business", domain="commerce", is_implemented=True),
    _m("commerce_swiggy", "Swiggy Integration", "Import and auto-bill Swiggy orders.", "business", domain="commerce", is_implemented=True, requires=["commerce"]),
    _m("commerce_zomato", "Zomato Integration", "Import and auto-bill Zomato orders.", "business", domain="commerce", is_implemented=True, requires=["commerce"]),
    _m("commerce_analytics", "Commerce Analytics", "Online order revenue, channel, and product analytics.", "business", domain="commerce", is_implemented=True, requires=["commerce"]),

    # ---- Restaurant (dine-in table service). The chain the whole module is built around is
    # Table -> Order -> KOT -> Invoice -> Payment: an order belongs to a table, a KOT is a subset
    # of that order's items sent to the kitchen, and the invoice is generated from the order (not
    # a second, independent sale) so table-wise and KOT reporting stay auditable. ----
    _m("restaurant", "Restaurant", "Dine-in table service, orders, and kitchen tickets.", "business", domain="restaurant", is_implemented=True, requires=["pos_billing"]),
    _m("floor_management", "Floor Management", "Group tables into floors/sections.", "business", domain="restaurant", is_implemented=True, requires=["restaurant"]),
    _m("table_management", "Table Management", "Create and manage restaurant tables.", "business", domain="restaurant", is_implemented=True, requires=["restaurant"], config_schema=[
        {"key": "max_tables", "label": "Maximum tables", "type": "number", "default": 50},
    ]),
    _m("kot", "KOT", "Kitchen Order Tickets with kitchen status tracking.", "business", domain="restaurant", is_implemented=True, requires=["restaurant"], config_schema=[
        {"key": "kot_printing", "label": "KOT printing", "type": "boolean", "default": True},
    ]),
    _m("table_transfer", "Table Transfer", "Move an active order to another table.", "business", domain="restaurant", is_implemented=True, requires=["restaurant", "table_management"]),
    _m("table_merge", "Table Merge", "Combine multiple table orders into one.", "business", domain="restaurant", is_implemented=True, requires=["restaurant", "table_management"]),
    _m("table_split", "Table Split", "Split a table order into separate bills.", "business", domain="restaurant", is_implemented=True, requires=["restaurant", "table_management"]),
    _m("restaurant_reports", "Restaurant Reports", "Table-wise sales, KOT, and dine-in reporting.", "business", domain="restaurant", is_implemented=True, requires=["restaurant"]),

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
    # "ai_assistance" is the umbrella module the Advanced plan grants by default (see
    # PLAN_DEFAULT_MODULES below) — is_implemented stays False like its sibling AI entries below
    # until real AI functionality ships; enabling it today has no functional effect, it just marks
    # the tenant as entitled once something is built behind it.
    _m("ai_assistance", "AI Assistance", "AI-powered assistance across the app.", "ai"),
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
    # Deliberately does NOT require payment_gateway: a UPI QR (static business VPA, or dynamic
    # with the exact bill amount) is a `upi://pay` deep link the customer's own bank app acts on,
    # so it needs a merchant VPA and nothing else. Only *automatic* confirmation of those payments
    # needs a provider, which is what payment_verification below gates — scanning a QR is never by
    # itself proof the bill was paid.
    _m("qr_payments", "QR Payments", "Accept payments via UPI QR code.", "premium", is_implemented=True, requires=["pos_billing"]),
    _m("payment_verification", "Payment Verification", "Automatically confirm UPI payments via a provider webhook.", "premium", requires=["payment_gateway", "qr_payments"]),
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

# What a plan grants by default. Modules not listed default to disabled. IMPORTANT: unlike a
# `TenantFeatureFlag` row (which is a one-time snapshot), a tenant with no stored row for a given
# module has its status recomputed from this list on every read (`_default_status` in
# `app/modules/admin_features/service.py`) — so narrowing a tier's list here *retroactively*
# disables that module for every existing tenant on that tier who never had an admin explicitly
# touch it. This is exactly what happens here going from the old basic/explore/advance scheme to
# the new BASIC/ADVANCED/CUSTOM one below — it's a deliberate, spec-driven tightening of what
# Basic/Advanced include (see the trial & subscription management implementation report), not an
# oversight. Any tenant that needs an exception can still get one via a per-tenant
# TenantFeatureFlag override, which this list never touches.
#
# BASIC: Dashboard, Sales (billing/POS), Catalog (products+categories), Customer, Activity Log,
# Settings — the modules named for this tier in the spec, PLUS three the spec's illustrative list
# didn't call out but which are backend-enforced (`assert_feature`/`require_feature`, not just
# frontend nav) as ordinary day-to-day POS operations rather than a premium tier, and were always
# reachable by every tenant before this change: "reports_analytics" is what actually gates the
# tenant's own Overview/Dashboard route (RequireModule moduleKey="reports_analytics" in
# billing-app/src/routes/router.tsx — the catalog's "dashboard" key is always_on and doesn't gate
# anything itself), "returns" gates Returns & Refunds, and "payments_credit" gates Outstanding.
# Neither Basic's nor Advanced's named list in the spec mentions Returns or Outstanding at all —
# that omission reads as "assumed baseline," not "Advanced-exclusive," and excluding them broke
# the existing, tested behavior of every current tenant. See app/modules/sales/router.py and
# app/modules/payments/router.py for the assert_feature call sites.
_BASIC_MODULES = [
    "dashboard", "pos_billing", "products", "categories", "customers", "activity_log", "settings",
    "reports_analytics", "payments_credit", "returns",
]

# ADVANCED = BASIC + Inventory, Procurement, Analytics, Commerce, AI Assistance — implemented as
# inheritance (BASIC + ADVANCED_ONLY), not a duplicated list, per the spec's explicit instruction.
# "Procurement", "Analytics", and "Commerce" are single named modules in the spec but multiple
# keys in this catalog (e.g. procurement's own vendors/purchase-entries/returns/payments
# sub-modules) — granting the parent key's natural sub-modules alongside it keeps that feature
# actually usable rather than gating it a second time. "invoice_designer" and "custom_branding"
# aren't named in the spec either, but were reachable by every tenant on the old top "advance"
# tier this replaces (its defaults were literally every catalog key) — kept here so upgrading an
# existing advance-tier tenant to the new tier scheme doesn't silently take those away.
_ADVANCED_ONLY_MODULES = [
    "inventory",
    "procurement", "vendors", "purchase_entries", "purchase_returns", "vendor_payments",
    "procurement_analytics", "procurement_reports",
    "analytics", "advanced_analytics", "trend_comparison",
    "commerce", "commerce_swiggy", "commerce_zomato", "commerce_analytics",
    "ai_assistance",
    "invoice_designer", "custom_branding", "barcode_printing", "expenses",
]
_ADVANCED_MODULES = [*_BASIC_MODULES, *_ADVANCED_ONLY_MODULES]

PLAN_DEFAULT_MODULES: dict[str, list[str]] = {
    "basic": _BASIC_MODULES,
    "advance": _ADVANCED_MODULES,
    # CUSTOM has no plan-level defaults at all — every module for a Custom tenant is an explicit
    # per-tenant TenantFeatureFlag choice (see PHASE 10 of the spec: "Admin can select exactly
    # what the customer requires"). Switching a tenant's plan to "custom" does not reset or touch
    # any of their existing TenantFeatureFlag rows — see get_effective_flags_for_tenant, which
    # only ever falls back to a plan default for a module that has no explicit row yet.
    "custom": [],
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
