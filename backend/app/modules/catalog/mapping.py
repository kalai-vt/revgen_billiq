from __future__ import annotations

CANONICAL_FIELDS = [
    "name",
    "identifier_value",
    "category",
    "cost_price",
    "selling_price",
    "tax_rate_percent",
    "barcode",
]

CANONICAL_LABELS = {
    "name": "Product Name",
    "identifier_value": "Identifier (PID/SKU)",
    "category": "Category",
    "cost_price": "Cost Price",
    "selling_price": "Selling Price",
    "tax_rate_percent": "Tax %",
    "barcode": "Barcode",
}

# Case-insensitive header synonyms so files "from different suppliers" auto-map
# whenever possible; anything not recognized here falls through to the manual
# Column Mapping screen.
_SYNONYMS: dict[str, list[str]] = {
    "name": ["product name", "product", "item name", "name"],
    "identifier_value": [
        "identifier (pid/sku)",
        "identifier",
        "identifier value",
        "pid",
        "sku",
        "product id",
        "item code",
        "product code",
    ],
    "category": ["category"],
    "cost_price": ["cost price", "purchase price", "cost"],
    "selling_price": ["selling price", "sale price", "sales price", "price", "mrp"],
    "tax_rate_percent": ["tax %", "tax", "tax percent", "tax rate", "gst %", "gst"],
    "barcode": ["barcode", "ean", "ean13", "upc"],
}


def auto_map(headers: list[str]) -> dict[str, str | None]:
    normalized = {header: header.strip().lower() for header in headers}
    mapping: dict[str, str | None] = dict.fromkeys(CANONICAL_FIELDS)
    for field, synonyms in _SYNONYMS.items():
        for header, norm in normalized.items():
            if norm in synonyms:
                mapping[field] = header
                break
    return mapping


def mapping_is_complete(mapping: dict[str, str | None]) -> bool:
    return bool(mapping.get("name")) and bool(mapping.get("identifier_value"))
