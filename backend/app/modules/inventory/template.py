from __future__ import annotations

import io

from openpyxl import Workbook

TEMPLATE_COLUMNS = [
    "Product ID (PID)",
    "SKU (Optional)",
    "Product Name",
    "Category",
    "Quantity",
    "Cost Price",
    "Selling Price",
    "Tax %",
    "Notes",
]


def generate_template_xlsx() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Inventory Import"
    sheet.append(TEMPLATE_COLUMNS)
    sheet.append(["PID-001", "", "Example Product", "Beverages", 100, 10.0, 20.0, 18, "Sample row — delete before uploading"])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
