from __future__ import annotations

import io
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A5, landscape, legal, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.formatting import format_amount
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.modules.invoice_designer.document_data import DocumentData
from app.schemas.invoice_template import InvoiceTemplateConfig, PaperConfig

LOGO_MAX_WIDTH = 40 * mm
LOGO_MAX_HEIGHT = 20 * mm

_ITEM_COLUMN_LABELS = {
    "row_number": "#", "product": "Item", "sku": "SKU", "barcode": "Barcode", "hsn_sac": "HSN/SAC",
    "batch": "Batch", "expiry": "Expiry", "serial": "Serial", "description": "Description",
    "qty": "Qty", "unit": "Unit", "mrp": "MRP", "selling_price": "Price", "discount": "Disc.",
    "tax": "Tax", "amount": "Amount",
}
_ALIGN_MAP = {"left": "LEFT", "center": "CENTER", "right": "RIGHT"}

_TAX_SUMMARY_LABELS = {
    "subtotal": "Subtotal", "discount": "Discount", "cgst": "CGST", "sgst": "SGST", "igst": "IGST",
    "cess": "CESS", "round_off": "Round Off", "shipping": "Shipping", "packing": "Packing Charges",
    "grand_total": "Grand Total", "paid": "Paid", "outstanding": "Outstanding", "balance": "Balance",
}

_FOOTER_LABELS = {
    "thank_you": "", "return_policy": "Return Policy", "exchange_policy": "Exchange Policy",
    "warranty": "Warranty Information", "terms_conditions": "Terms & Conditions", "business_notes": "",
}


def _logo_flowable(logo_url: str, max_width: float = LOGO_MAX_WIDTH, max_height: float = LOGO_MAX_HEIGHT) -> Image | None:
    """Resolve a logo URL (local `/uploads/...` path or a remote Blob URL) and size it to fit.

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
            img.load()
            width_px, height_px = img.size
        if isinstance(source, io.BytesIO):
            source.seek(0)
        aspect = height_px / width_px if width_px else 1
        width = max_width
        height = width * aspect
        if height > max_height:
            height = max_height
            width = height / aspect
        return Image(source, width=width, height=height)
    except Exception:
        return None


def _qr_flowable(data: str, size: float = 22 * mm) -> Image | None:
    try:
        import qrcode

        qr = qrcode.QRCode(border=1, box_size=6)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        return Image(buffer, width=size, height=size)
    except Exception:
        return None


def _barcode_flowable(value: str, width: float = 55 * mm, height: float = 14 * mm):
    try:
        from reportlab.graphics.barcode.code128 import Code128
        from reportlab.graphics.shapes import Drawing

        barcode = Code128(value or "0", barHeight=height, barWidth=0.35 * mm)
        drawing = Drawing(width, height)
        drawing.add(barcode)
        return drawing
    except Exception:
        return None


def _pagesize(paper: PaperConfig) -> tuple[float, float]:
    size = paper.size
    if size == "A4":
        base = A4
    elif size == "A5":
        base = A5
    elif size == "letter":
        base = letter
    elif size == "legal":
        base = legal
    elif size == "58mm":
        base = (58 * mm, 2000 * mm)
    elif size == "80mm":
        base = (80 * mm, 2000 * mm)
    elif size == "custom" and paper.custom_width_mm and paper.custom_height_mm:
        base = (paper.custom_width_mm * mm, paper.custom_height_mm * mm)
    else:
        base = A4
    if paper.orientation == "landscape" and size not in ("58mm", "80mm"):
        return landscape(base)
    return base


def _scaled_styles(font_scale_percent: int) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    scale = font_scale_percent / 100
    return {
        "Title": ParagraphStyle("Title", parent=base["Title"], fontSize=base["Title"].fontSize * scale, leading=base["Title"].leading * scale),
        "Heading2": ParagraphStyle("Heading2", parent=base["Heading2"], fontSize=base["Heading2"].fontSize * scale, leading=base["Heading2"].leading * scale),
        "Normal": ParagraphStyle("Normal", parent=base["Normal"], fontSize=base["Normal"].fontSize * scale, leading=base["Normal"].leading * scale),
    }


def render_document_pdf(data: DocumentData, tenant: Tenant, settings: Settings | None, config: InvoiceTemplateConfig) -> bytes:
    decimal_precision = settings.decimal_precision if settings else 2
    date_format = settings.date_format if settings else "DD/MM/YYYY"
    date_pattern = {"DD/MM/YYYY": "%d/%m/%Y", "MM/DD/YYYY": "%m/%d/%Y", "YYYY-MM-DD": "%Y-%m-%d"}.get(date_format, "%d/%m/%Y")

    pagesize = _pagesize(config.paper)
    margin = config.paper.margin_mm
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=pagesize,
        topMargin=margin.top * mm, bottomMargin=margin.bottom * mm,
        leftMargin=margin.left * mm, rightMargin=margin.right * mm,
    )
    styles = _scaled_styles(config.paper.font_scale_percent)
    primary = colors.HexColor(config.theme.primary_color)
    story: list = []

    # --- Branding / header ---
    b = config.branding
    logo_size = {"sm": 12 * mm, "md": 20 * mm, "lg": 28 * mm}.get(config.paper.logo_size_preset, 20 * mm)
    if b.show_logo and settings and settings.logo_url:
        logo = _logo_flowable(settings.logo_url, max_width=logo_size * 2, max_height=logo_size)
        if logo:
            story.append(logo)
            story.append(Spacer(1, 2 * mm))

    if b.show_business_name:
        story.append(Paragraph(xml_escape(tenant.company_name), ParagraphStyle("Business", parent=styles["Title"], textColor=primary)))
    if b.show_tagline and settings and settings.tagline:
        story.append(Paragraph(xml_escape(settings.tagline), styles["Normal"]))
    if b.show_address and settings:
        address_parts = [settings.address_line1, settings.address_line2, ", ".join(p for p in [settings.city, settings.state] if p), settings.pincode]
        address = ", ".join(p for p in address_parts if p)
        if address:
            story.append(Paragraph(xml_escape(address), styles["Normal"]))
    contact_bits = []
    if b.show_phone and tenant.phone:
        contact_bits.append(xml_escape(tenant.phone))
    if b.show_email and tenant.email:
        contact_bits.append(xml_escape(tenant.email))
    if b.show_website and settings and settings.website:
        contact_bits.append(xml_escape(settings.website))
    if contact_bits:
        story.append(Paragraph(" | ".join(contact_bits), styles["Normal"]))
    id_bits = []
    if b.show_gstin and data.customer_gstin:
        id_bits.append(f"GSTIN: {xml_escape(data.customer_gstin)}")
    if b.show_pan and settings and settings.pan_number:
        id_bits.append(f"PAN: {xml_escape(settings.pan_number)}")
    if b.show_fssai and settings and settings.fssai_number:
        id_bits.append(f"FSSAI: {xml_escape(settings.fssai_number)}")
    if b.show_drug_license and settings and settings.drug_license_number:
        id_bits.append(f"DL No: {xml_escape(settings.drug_license_number)}")
    if b.show_msme_udyam and settings and settings.msme_udyam_number:
        id_bits.append(f"MSME: {xml_escape(settings.msme_udyam_number)}")
    if id_bits:
        story.append(Paragraph(" | ".join(id_bits), styles["Normal"]))

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(xml_escape(data.label.upper()), styles["Heading2"]))

    info_fields = config.invoice_info.fields
    info_lines = []
    if info_fields.invoice_number:
        info_lines.append(f"No: {xml_escape(data.number)}")
    if info_fields.date:
        info_lines.append(f"Date: {data.created_at.strftime(date_pattern)}")
    if info_fields.time:
        info_lines.append(f"Time: {data.created_at.strftime('%I:%M %p')}")
    if info_fields.due_date and data.due_date:
        info_lines.append(f"Due: {data.due_date.strftime(date_pattern)}")
    if info_fields.cashier and data.cashier:
        info_lines.append(f"Cashier: {xml_escape(data.cashier)}")
    if info_fields.counter and data.counter:
        info_lines.append(f"Counter: {xml_escape(data.counter)}")
    if info_fields.order_number and data.order_number:
        info_lines.append(f"Order: {xml_escape(data.order_number)}")
    if info_fields.customer_id and data.customer_id:
        info_lines.append(f"Customer ID: {xml_escape(data.customer_id)}")
    if info_fields.payment_method and data.payment_method:
        info_lines.append(f"Payment: {xml_escape(data.payment_method)}")
    if info_fields.payment_status and data.payment_status:
        info_lines.append(f"Payment Status: {xml_escape(data.payment_status)}")
    if info_fields.invoice_status and data.invoice_status:
        info_lines.append(f"Status: {xml_escape(data.invoice_status)}")
    for line in info_lines:
        story.append(Paragraph(line, styles["Normal"]))

    cust_fields = config.customer_details.fields
    cust_lines = []
    if cust_fields.name and data.customer_name:
        cust_lines.append(f"Customer: {xml_escape(data.customer_name)}")
    if cust_fields.company_name and data.customer_company_name:
        cust_lines.append(xml_escape(data.customer_company_name))
    if cust_fields.mobile and data.customer_mobile:
        cust_lines.append(f"Phone: {xml_escape(data.customer_mobile)}")
    if cust_fields.email and data.customer_email:
        cust_lines.append(f"Email: {xml_escape(data.customer_email)}")
    if cust_fields.address and data.customer_address:
        cust_lines.append(f"Address: {xml_escape(data.customer_address)}")
    if cust_fields.gstin and data.customer_gstin:
        cust_lines.append(f"GSTIN: {xml_escape(data.customer_gstin)}")
    if cust_fields.loyalty_number and data.customer_loyalty_number:
        cust_lines.append(f"Loyalty: {xml_escape(data.customer_loyalty_number)}")
    if cust_fields.membership and data.customer_membership:
        cust_lines.append(f"Membership: {xml_escape(data.customer_membership)}")
    if cust_lines:
        story.append(Spacer(1, 2 * mm))
        for line in cust_lines:
            story.append(Paragraph(line, styles["Normal"]))

    story.append(Spacer(1, 6 * mm))

    # --- Item table ---
    visible_columns = sorted((c for c in config.item_table.columns if c.visible), key=lambda c: c.order)
    if visible_columns:
        header_row = [_ITEM_COLUMN_LABELS.get(c.key, c.key) for c in visible_columns]
        table_data = [header_row]
        for idx, item in enumerate(data.items):
            row = []
            for col in visible_columns:
                if col.key == "row_number":
                    row.append(str(idx + 1))
                else:
                    row.append(item.values.get(col.key, ""))
            table_data.append(row)

        col_widths = None
        if all(c.width for c in visible_columns):
            total_width = pagesize[0] - margin.left * mm - margin.right * mm
            col_widths = [total_width * (c.width / 100) for c in visible_columns]

        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        table_style = [
            ("BACKGROUND", (0, 0), (-1, 0), primary),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9 * config.paper.font_scale_percent / 100),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        for i, col in enumerate(visible_columns):
            table_style.append(("ALIGN", (i, 0), (i, -1), _ALIGN_MAP.get(col.align, "LEFT")))
        if config.item_table.show_borders:
            table_style.append(("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")))
        else:
            table_style.append(("LINEBELOW", (0, 0), (-1, 0), 0.75, primary))
        if config.item_table.alternate_row_colors:
            table_style.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]))
        table.setStyle(TableStyle(table_style))
        story.append(table)
        story.append(Spacer(1, 6 * mm))

    # --- Tax & summary ---
    fields = config.tax_summary.fields
    summary_rows = []
    for key in ("subtotal", "discount", "cgst", "sgst", "igst", "cess", "shipping", "packing", "round_off"):
        if getattr(fields, key) and data.totals.get(key):
            summary_rows.append([_TAX_SUMMARY_LABELS[key], format_amount(data.totals[key], decimal_precision)])
    if fields.grand_total:
        summary_rows.append(["Grand Total", format_amount(data.totals.get("grand_total", 0), decimal_precision)])
    if fields.paid:
        summary_rows.append(["Paid", format_amount(data.totals.get("paid", 0), decimal_precision)])
    if fields.outstanding:
        summary_rows.append(["Outstanding", format_amount(data.totals.get("outstanding", 0), decimal_precision)])
    if fields.balance:
        summary_rows.append(["Balance", format_amount(data.totals.get("balance", 0), decimal_precision)])

    if summary_rows:
        summary_table = Table(summary_rows, colWidths=[pagesize[0] * 0.65, pagesize[0] * 0.2])
        summary_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 10 * config.paper.font_scale_percent / 100),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("LINEABOVE", (0, -1), (-1, -1), 0.75, colors.black),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("TEXTCOLOR", (0, -1), (-1, -1), primary),
                ]
            )
        )
        story.append(summary_table)

    if fields.amount_in_words and data.amount_in_words:
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(f"<i>{xml_escape(data.amount_in_words)}</i>", styles["Normal"]))

    # --- QR & barcode ---
    qr = config.qr_barcode
    qr_flowables = []
    if qr.invoice_qr:
        flow = _qr_flowable(f"Invoice:{data.number}|Amount:{data.totals.get('grand_total', 0):.2f}")
        if flow:
            qr_flowables.append(flow)
    if qr.website_qr and settings and settings.website:
        flow = _qr_flowable(settings.website)
        if flow:
            qr_flowables.append(flow)
    if qr.feedback_qr and settings and settings.feedback_url:
        flow = _qr_flowable(settings.feedback_url)
        if flow:
            qr_flowables.append(flow)
    if qr.business_qr:
        flow = _qr_flowable(f"{tenant.company_name}\n{tenant.phone or ''}\n{tenant.email or ''}")
        if flow:
            qr_flowables.append(flow)
    if qr.payment_qr:
        flow = _qr_flowable(f"upi://pay?pn={tenant.company_name}&am={data.totals.get('grand_total', 0):.2f}")
        if flow:
            qr_flowables.append(flow)
    if qr_flowables:
        story.append(Spacer(1, 6 * mm))
        qr_row = Table([qr_flowables])
        qr_row.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        story.append(qr_row)
    if qr.barcode:
        barcode = _barcode_flowable(data.number)
        if barcode:
            story.append(Spacer(1, 4 * mm))
            story.append(barcode)

    # --- Footer ---
    footer_sections = sorted((s for s in config.footer.sections if s.enabled and s.text), key=lambda s: s.order)
    if footer_sections:
        story.append(Spacer(1, 6 * mm))
        for section in footer_sections:
            story.append(Paragraph(xml_escape(section.text), styles["Normal"]))
    elif settings and settings.receipt_footer:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph(xml_escape(settings.receipt_footer), styles["Normal"]))

    # --- Signature ---
    sig = config.signature
    if sig.show_authorized_signature or sig.show_customer_signature:
        story.append(Spacer(1, 10 * mm))
        sig_row = []
        if sig.show_authorized_signature:
            sig_row.append(Paragraph("_______________________<br/>Authorized Signature", styles["Normal"]))
        if sig.show_customer_signature:
            sig_row.append(Paragraph("_______________________<br/>Customer Signature", styles["Normal"]))
        sig_table = Table([sig_row])
        sig_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("FONTSIZE", (0, 0), (-1, -1), 9)]))
        story.append(sig_table)

    doc.build(story)
    return buffer.getvalue()
