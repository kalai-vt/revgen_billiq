from __future__ import annotations

import io

from openpyxl import Workbook

TEMPLATE_COLUMNS = ["Product Name", "Identifier (PID/SKU)", "Category", "Cost Price", "Selling Price", "Tax %", "Barcode"]


def generate_template_xlsx() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Products Import"
    sheet.append(TEMPLATE_COLUMNS)
    sheet.append(["Example Product", "PID-001", "Beverages", 10.0, 20.0, 18, ""])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
