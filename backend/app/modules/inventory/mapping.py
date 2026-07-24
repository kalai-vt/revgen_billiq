from __future__ import annotations

CANONICAL_FIELDS = [
    "pid",
    "sku",
    "product_name",
    "category",
    "quantity",
    "cost_price",
    "selling_price",
    "tax_percent",
    "notes",
]

CANONICAL_LABELS = {
    "pid": "Product ID (PID)",
    "sku": "SKU",
    "product_name": "Product Name",
    "category": "Category",
    "quantity": "Quantity",
    "cost_price": "Cost Price",
    "selling_price": "Selling Price",
    "tax_percent": "Tax %",
    "notes": "Notes",
}

# Case-insensitive header synonyms so files "from different suppliers" auto-map
# whenever possible; anything not recognized here falls through to the manual
# Column Mapping screen.
_SYNONYMS: dict[str, list[str]] = {
    "pid": ["product id (pid)", "product id", "pid", "item code", "item id", "product code"],
    "sku": ["sku (optional)", "sku"],
    "product_name": ["product name", "product", "item name", "name"],
    "category": ["category"],
    "quantity": ["quantity", "qty", "stock", "stock quantity", "in stock"],
    "cost_price": ["cost price", "purchase price", "cost"],
    "selling_price": ["selling price", "sale price", "sales price", "price", "mrp"],
    "tax_percent": ["tax %", "tax", "tax percent", "gst %", "gst"],
    "notes": ["notes", "remarks", "comment", "comments"],
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
    if not mapping.get("quantity"):
        return False
    if not mapping.get("pid") and not mapping.get("sku"):
        return False
    return True
