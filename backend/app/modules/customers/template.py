from __future__ import annotations

import io

from openpyxl import Workbook

TEMPLATE_COLUMNS = ["Name", "Mobile", "Email", "Address"]


def generate_template_xlsx() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Customers Import"
    sheet.append(TEMPLATE_COLUMNS)
    sheet.append(["Example Customer", "9876543210", "customer@example.com", "123 Main St"])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
