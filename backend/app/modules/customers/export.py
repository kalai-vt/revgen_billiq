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
from app.models.customer import Customer

EXPORT_HEADERS = ["Name", "Mobile", "Email", "Address", "Status"]


def _rows(items: list[Customer]) -> list[list[str]]:
    return [
        [
            item.name,
            item.mobile or "",
            item.email or "",
            item.address or "",
            "Active" if item.is_active else "Inactive",
        ]
        for item in items
    ]


def export_customers_excel(items: list[Customer]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Customers"
    sheet.append(EXPORT_HEADERS)
    for row in _rows(items):
        sheet.append([escape_formula(value) for value in row])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_customers_csv(items: list[Customer]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(EXPORT_HEADERS)
    for row in _rows(items):
        writer.writerow([escape_formula(value) for value in row])
    return output.getvalue().encode("utf-8")


def export_customers_pdf(items: list[Customer]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4), topMargin=14 * mm, bottomMargin=14 * mm, leftMargin=14 * mm, rightMargin=14 * mm
    )
    styles = getSampleStyleSheet()
    story = [Paragraph("Customers Report", styles["Title"]), Spacer(1, 4 * mm)]

    table_data = [EXPORT_HEADERS] + _rows(items)
    table = Table(table_data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    return buffer.getvalue()
