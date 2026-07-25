from __future__ import annotations

import io
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.formatting import format_amount, format_date
from app.models.returns import Return
from app.models.sales import Invoice
from app.models.settings import Settings
from app.models.tenant import Tenant

LOGO_MAX_WIDTH = 40 * mm
LOGO_MAX_HEIGHT = 20 * mm


def _logo_flowable(logo_url: str) -> Image | None:
    """Resolve a logo URL (local `/uploads/...` path or a remote Blob URL) and size it to fit
    the invoice header.

    Best-effort: any missing file, unreadable image, or unsupported format (e.g. SVG, which
    reportlab can't rasterize without an extra dependency) silently skips the logo rather than
    breaking invoice PDF generation for the whole tenant.
    """
    try:
        from PIL import Image as PILImage

        clean_url = logo_url.split("?", 1)[0]
        if clean_url.startswith("http://") or clean_url.startswith("https://"):
            import httpx

            response = httpx.get(clean_url, timeout=10.0)
            response.raise_for_status()
            source: str | io.BytesIO = io.BytesIO(response.content)
        else:
            local_path = Path(clean_url.lstrip("/"))
            if not local_path.is_file():
                return None
            source = str(local_path)

        with PILImage.open(source) as img:
            img.load()  # force full decode now so a truncated/corrupt file is caught here, not mid-PDF-build
            width_px, height_px = img.size
        if isinstance(source, io.BytesIO):
            source.seek(0)
        aspect = height_px / width_px if width_px else 1
        width = LOGO_MAX_WIDTH
        height = width * aspect
        if height > LOGO_MAX_HEIGHT:
            height = LOGO_MAX_HEIGHT
            width = height / aspect
        return Image(source, width=width, height=height)
    except Exception:
        return None


def render_invoice_pdf(invoice: Invoice, tenant: Tenant, settings: Settings | None = None) -> bytes:
    decimal_precision = settings.decimal_precision if settings else 2
    date_format = settings.date_format if settings else "DD/MM/YYYY"
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm
    )
    styles = getSampleStyleSheet()
    story = []

    if settings and settings.logo_url:
        logo = _logo_flowable(settings.logo_url)
        if logo:
            story.append(logo)
            story.append(Spacer(1, 4 * mm))

    # Paragraph() parses a small XML-like markup language (<b>, <font>, <a href=...>, ...),
    # so any free-text field a user can set (company name, GST number, customer name/phone —
    # customer_name/phone especially, entered by any cashier at checkout) must be XML-escaped
    # before interpolation, or a value like "<font size=999>" breaks/hijacks the rendering.
    story.append(Paragraph(xml_escape(tenant.company_name), styles["Title"]))
    if invoice.gst_number:
        story.append(Paragraph(f"GSTIN: {xml_escape(invoice.gst_number)}", styles["Normal"]))
    story.append(Paragraph(f"Invoice {xml_escape(invoice.invoice_number)}", styles["Heading2"]))
    story.append(Paragraph(format_date(invoice.created_at, date_format), styles["Normal"]))
    if invoice.customer_name:
        story.append(Paragraph(f"Customer: {xml_escape(invoice.customer_name)}", styles["Normal"]))
    if invoice.customer_phone:
        story.append(Paragraph(f"Phone: {xml_escape(invoice.customer_phone)}", styles["Normal"]))
    story.append(Spacer(1, 8 * mm))

    table_data = [["Item", "Identifier", "Qty", "Unit Price", "Tax", "Line Total"]]
    for item in invoice.items:
        table_data.append(
            [
                item.product_name,
                item.identifier_value,
                f"{item.quantity:g}",
                format_amount(item.unit_price, decimal_precision),
                format_amount(item.tax_amount, decimal_precision),
                format_amount(item.line_total, decimal_precision),
            ]
        )

    table = Table(table_data, colWidths=[55 * mm, 25 * mm, 15 * mm, 25 * mm, 20 * mm, 25 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 8 * mm))

    summary_rows = [["Subtotal", format_amount(invoice.subtotal, decimal_precision)]]
    if invoice.discount_amount:
        label = "Discount"
        if invoice.discount_type == "percent":
            label = f"Discount ({invoice.discount_value:g}%)"
        summary_rows.append([label, f"-{format_amount(invoice.discount_amount, decimal_precision)}"])
    summary_rows.append(["Tax", format_amount(invoice.tax_amount, decimal_precision)])
    summary_rows.append(["Total", format_amount(invoice.total_amount, decimal_precision)])
    summary_rows.append(["Payment method", invoice.payment_method.upper()])
    if invoice.amount_tendered is not None:
        summary_rows.append(["Amount tendered", format_amount(invoice.amount_tendered, decimal_precision)])
    if invoice.change_due is not None:
        summary_rows.append(["Change due", format_amount(invoice.change_due, decimal_precision)])

    summary_table = Table(summary_rows, colWidths=[130 * mm, 35 * mm])
    summary_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.black),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    story.append(summary_table)

    if settings and settings.receipt_footer:
        story.append(Spacer(1, 8 * mm))
        story.append(Paragraph(xml_escape(settings.receipt_footer), styles["Normal"]))

    doc.build(story)
    return buffer.getvalue()


_RETURN_STATUS_LABELS = {"fully_refunded": "Fully Refunded", "partially_refunded": "Partially Refunded", "cancelled": "Cancelled"}


def render_return_pdf(ret: Return, invoice: Invoice, tenant: Tenant, settings: Settings | None = None) -> bytes:
    decimal_precision = settings.decimal_precision if settings else 2
    date_format = settings.date_format if settings else "DD/MM/YYYY"
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm
    )
    styles = getSampleStyleSheet()
    story = []

    if settings and settings.logo_url:
        logo = _logo_flowable(settings.logo_url)
        if logo:
            story.append(logo)
            story.append(Spacer(1, 4 * mm))

    story.append(Paragraph(xml_escape(tenant.company_name), styles["Title"]))
    story.append(Paragraph(f"Return Receipt {xml_escape(ret.return_number)}", styles["Heading2"]))
    story.append(Paragraph(format_date(ret.created_at, date_format), styles["Normal"]))
    story.append(Paragraph(f"Against Invoice {xml_escape(invoice.invoice_number)}", styles["Normal"]))
    if invoice.customer_name:
        story.append(Paragraph(f"Customer: {xml_escape(invoice.customer_name)}", styles["Normal"]))
    story.append(Paragraph(f"Status: {_RETURN_STATUS_LABELS.get(ret.status, ret.status)}", styles["Normal"]))
    story.append(Spacer(1, 8 * mm))

    table_data = [["Item", "Identifier", "Qty", "Reason", "Refund"]]
    for item in ret.items:
        table_data.append(
            [
                item.product_name,
                item.identifier_value,
                f"{item.quantity_returned:g}",
                item.reason.replace("_", " ").title(),
                format_amount(item.line_refund_amount, decimal_precision),
            ]
        )

    table = Table(table_data, colWidths=[55 * mm, 25 * mm, 15 * mm, 35 * mm, 25 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 8 * mm))

    summary_rows = [["Subtotal", format_amount(ret.subtotal_amount, decimal_precision)]]
    if ret.discount_adjustment:
        summary_rows.append(["Discount adjustment", f"-{format_amount(ret.discount_adjustment, decimal_precision)}"])
    summary_rows.append(["Tax adjustment", format_amount(ret.tax_adjustment, decimal_precision)])
    if ret.round_off:
        summary_rows.append(["Round off", format_amount(ret.round_off, decimal_precision)])
    summary_rows.append(["Grand Refund", format_amount(ret.refund_amount, decimal_precision)])
    summary_rows.append(["Refund method", ret.refund_method.upper()])

    summary_table = Table(summary_rows, colWidths=[130 * mm, 35 * mm])
    summary_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.black),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    story.append(summary_table)

    doc.build(story)
    return buffer.getvalue()
