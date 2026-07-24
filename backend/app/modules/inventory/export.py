from __future__ import annotations

import csv
import io

from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.sanitize import escape_formula
from app.schemas.inventory import InventoryOut

EXPORT_HEADERS = ["Product", "Identifier", "Category", "Current Stock", "Cost Price", "Selling Price", "Tax %", "Last Updated"]


def _rows(items: list[InventoryOut]) -> list[list[str]]:
    return [
        [
            item.product_name,
            item.identifier_value,
            item.category_name or "",
            f"{item.quantity:g}",
            f"{item.cost_price:.2f}",
            f"{item.selling_price:.2f}",
            f"{item.tax_rate_percent:g}%",
            item.updated_at.strftime("%Y-%m-%d"),
        ]
        for item in items
    ]


def export_inventory_excel(items: list[InventoryOut]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Inventory"
    sheet.append(EXPORT_HEADERS)
    for row in _rows(items):
        # Only the free-text columns (Product, Identifier, Category) can carry a
        # formula-injection payload — escape those before they reach a real
        # spreadsheet app; the remaining columns are server-formatted numbers/dates.
        text_columns, rest = row[:3], row[3:]
        sheet.append([escape_formula(value) for value in text_columns] + rest)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_inventory_csv(items: list[InventoryOut]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(EXPORT_HEADERS)
    for row in _rows(items):
        text_columns, rest = row[:3], row[3:]
        writer.writerow([escape_formula(value) for value in text_columns] + rest)
    return output.getvalue().encode("utf-8")


def export_inventory_pdf(items: list[InventoryOut]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4), topMargin=14 * mm, bottomMargin=14 * mm, leftMargin=14 * mm, rightMargin=14 * mm
    )
    styles = getSampleStyleSheet()
    story = [Paragraph("Inventory Report", styles["Title"]), Spacer(1, 4 * mm)]

    table_data = [EXPORT_HEADERS] + _rows(items)
    table = Table(table_data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    return buffer.getvalue()
