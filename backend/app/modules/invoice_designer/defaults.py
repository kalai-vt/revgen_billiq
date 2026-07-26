from __future__ import annotations

from app.schemas.invoice_template import (
    FooterConfig,
    FooterSection,
    InvoiceTemplateConfig,
    ItemColumn,
    ItemTableConfig,
)

# Canonical order every template's item-table starts with (visibility/order/width/align are then
# overridden per document type below). Keeping every column always present — just toggled
# visible/false — means the designer UI never has to special-case "a column doesn't exist yet".
ALL_ITEM_COLUMN_KEYS = (
    "row_number", "product", "sku", "barcode", "hsn_sac", "batch", "expiry", "serial",
    "description", "qty", "unit", "mrp", "selling_price", "discount", "tax", "amount",
)

_ALL_FOOTER_KEYS = ("thank_you", "return_policy", "exchange_policy", "warranty", "terms_conditions", "business_notes")


def _column_align(key: str) -> str:
    if key == "row_number":
        return "center"
    if key in ("product", "description", "sku", "barcode", "batch", "serial"):
        return "left"
    return "right"


def _item_table(visible_in_order: list[str]) -> ItemTableConfig:
    columns: list[ItemColumn] = []
    order = 0
    for key in visible_in_order:
        columns.append(ItemColumn(key=key, visible=True, order=order, align=_column_align(key)))
        order += 1
    for key in ALL_ITEM_COLUMN_KEYS:
        if key not in visible_in_order:
            columns.append(ItemColumn(key=key, visible=False, order=order))
            order += 1
    return ItemTableConfig(columns=columns, show_borders=True, alternate_row_colors=True)


def _footer(thank_you_text: str) -> FooterConfig:
    sections = [FooterSection(key="thank_you", enabled=True, text=thank_you_text, order=0)]
    order = 1
    for key in _ALL_FOOTER_KEYS:
        if key == "thank_you":
            continue
        sections.append(FooterSection(key=key, enabled=False, text="", order=order))
        order += 1
    return FooterConfig(sections=sections)


def default_template_config() -> InvoiceTemplateConfig:
    """The base shape every resolved config is deep-merged over, so older/partial stored
    configs (schema evolution) always fill in missing sections/keys with sane values."""
    config = InvoiceTemplateConfig()
    config.item_table = _item_table(["product", "sku", "qty", "selling_price", "tax", "amount"])
    config.footer = _footer("Thank you for shopping with us!")
    return config


def _builtin_tax_invoice() -> InvoiceTemplateConfig:
    # Matches today's hardcoded ReportLab look so tenants who never open the designer see
    # unchanged output: logo + company name + GSTIN + invoice number/date, item table with
    # Item/Identifier/Qty/Unit Price/Tax/Line Total, subtotal/discount/tax/total summary.
    config = default_template_config()
    config.branding.show_gstin = True
    config.tax_summary.fields.subtotal = True
    config.tax_summary.fields.discount = True
    config.tax_summary.fields.grand_total = True
    config.invoice_info.fields.payment_method = True
    return config


def _builtin_receipt() -> InvoiceTemplateConfig:
    config = default_template_config()
    config.paper.size = "80mm"
    config.header.layout = "minimal"
    config.branding.show_gstin = False
    config.item_table = _item_table(["product", "qty", "selling_price", "amount"])
    return config


def _builtin_credit_note() -> InvoiceTemplateConfig:
    config = default_template_config()
    config.item_table = _item_table(["product", "sku", "qty", "discount", "amount"])
    config.footer = _footer("This is a system-generated credit note.")
    return config


def _builtin_estimate() -> InvoiceTemplateConfig:
    config = default_template_config()
    config.footer = _footer("This is an estimate, not a tax invoice.")
    return config


def _builtin_delivery_challan() -> InvoiceTemplateConfig:
    config = default_template_config()
    config.tax_summary.fields.grand_total = False
    config.tax_summary.fields.subtotal = False
    config.tax_summary.fields.discount = False
    config.footer = _footer("Goods dispatched as per this delivery challan.")
    return config


_BUILTIN_NAMES: dict[str, str] = {
    "tax_invoice": "Standard Tax Invoice",
    "estimate": "Standard Estimate",
    "quotation": "Standard Quotation",
    "proforma": "Standard Proforma Invoice",
    "delivery_challan": "Standard Delivery Challan",
    "credit_note": "Standard Credit Note",
    "debit_note": "Standard Debit Note",
    "receipt": "Standard Receipt",
}

_BUILTIN_FACTORIES = {
    "tax_invoice": _builtin_tax_invoice,
    "estimate": _builtin_estimate,
    "quotation": _builtin_estimate,
    "proforma": _builtin_estimate,
    "delivery_challan": _builtin_delivery_challan,
    "credit_note": _builtin_credit_note,
    "debit_note": _builtin_credit_note,
    "receipt": _builtin_receipt,
}


def builtin_name(document_type: str) -> str:
    return _BUILTIN_NAMES.get(document_type, document_type.replace("_", " ").title())


def builtin_config(document_type: str) -> InvoiceTemplateConfig:
    factory = _BUILTIN_FACTORIES.get(document_type, default_template_config)
    return factory()
