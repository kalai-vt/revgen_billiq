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
from app.models.returns import Return
from app.models.sales import Invoice

EXPORT_HEADERS = ["Invoice #", "Date", "Customer", "Status", "Subtotal", "Discount", "Tax", "Total", "Payment Method"]

_STATUS_LABELS = {"paid": "Paid", "partial": "Partial", "cancelled": "Cancelled", "refunded": "Refunded"}

RETURN_EXPORT_HEADERS = [
    "Return #", "Invoice #", "Date", "Customer", "Items", "Refund Amount", "Refund Method", "Status", "Processed By",
]

_RETURN_STATUS_LABELS = {"fully_refunded": "Fully Refunded", "partially_refunded": "Partially Refunded", "cancelled": "Cancelled"}


def _rows(items: list[Invoice]) -> list[list[str]]:
    return [
        [
            item.invoice_number,
            item.created_at.strftime("%Y-%m-%d %H:%M"),
            item.customer_name or "Walk-in",
            _STATUS_LABELS.get(item.status, item.status),
            f"{item.subtotal:.2f}",
            f"{item.discount_amount:.2f}",
            f"{item.tax_amount:.2f}",
            f"{item.total_amount:.2f}",
            item.payment_method.upper(),
        ]
        for item in items
    ]


def export_invoices_excel(items: list[Invoice]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Invoices"
    sheet.append(EXPORT_HEADERS)
    for row in _rows(items):
        text_columns, rest = row[:4], row[4:]
        sheet.append([escape_formula(value) for value in text_columns] + rest)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_invoices_csv(items: list[Invoice]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(EXPORT_HEADERS)
    for row in _rows(items):
        text_columns, rest = row[:4], row[4:]
        writer.writerow([escape_formula(value) for value in text_columns] + rest)
    return output.getvalue().encode("utf-8")


def export_invoices_pdf(items: list[Invoice]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4), topMargin=14 * mm, bottomMargin=14 * mm, leftMargin=14 * mm, rightMargin=14 * mm
    )
    styles = getSampleStyleSheet()
    story = [Paragraph("Invoices Report", styles["Title"]), Spacer(1, 4 * mm)]

    table_data = [EXPORT_HEADERS] + _rows(items)
    table = Table(table_data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("ALIGN", (4, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    return buffer.getvalue()


def _return_rows(items: list[Return]) -> list[list[str]]:
    return [
        [
            item.return_number,
            item.invoice_number,  # type: ignore[attr-defined]
            item.created_at.strftime("%Y-%m-%d %H:%M"),
            item.customer_name or "Walk-in",  # type: ignore[attr-defined]
            ", ".join(f"{line.product_name} ×{line.quantity_returned:g}" for line in item.items),
            f"{item.refund_amount:.2f}",
            item.refund_method.upper(),
            _RETURN_STATUS_LABELS.get(item.status, item.status),
            item.created_by_name,  # type: ignore[attr-defined]
        ]
        for item in items
    ]


def export_returns_excel(items: list[Return]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Returns"
    sheet.append(RETURN_EXPORT_HEADERS)
    for row in _return_rows(items):
        text_columns, rest = row[:5], row[5:]
        sheet.append([escape_formula(value) for value in text_columns] + rest)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_returns_csv(items: list[Return]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(RETURN_EXPORT_HEADERS)
    for row in _return_rows(items):
        text_columns, rest = row[:5], row[5:]
        writer.writerow([escape_formula(value) for value in text_columns] + rest)
    return output.getvalue().encode("utf-8")


def export_returns_pdf(items: list[Return]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4), topMargin=14 * mm, bottomMargin=14 * mm, leftMargin=14 * mm, rightMargin=14 * mm
    )
    styles = getSampleStyleSheet()
    story = [Paragraph("Returns Report", styles["Title"]), Spacer(1, 4 * mm)]

    table_data = [RETURN_EXPORT_HEADERS] + _return_rows(items)
    table = Table(table_data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("ALIGN", (5, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    return buffer.getvalue()
