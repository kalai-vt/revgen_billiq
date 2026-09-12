from __future__ import annotations

import io
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

import httpx

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, A5, landscape, legal, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.formatting import format_amount
from app.core.pdf_utils import logo_flowable
from app.core.upi import build_upi_uri, payment_qr_enabled, should_render_payment_qr
from app.models.promotion import PromotionConfig
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.modules.invoice_designer.document_data import DocumentData
from app.schemas.invoice_template import BillIQPromotionConfig, InvoiceTemplateConfig, PaperConfig

_PROMOTION_FONT_SIZES = {"sm": 8, "md": 10, "lg": 13}
_PROMOTION_SPACING_MM = {"compact": 1.0, "normal": 2.0, "relaxed": 3.5}

_ITEM_COLUMN_LABELS = {
    "row_number": "#", "product": "Item", "sku": "SKU", "barcode": "Barcode", "hsn_sac": "HSN/SAC",
    "batch": "Batch", "expiry": "Expiry", "serial": "Serial", "description": "Description",
    "qty": "Qty", "unit": "Unit", "mrp": "MRP", "selling_price": "Price", "discount": "Disc.",
    "tax": "Tax", "amount": "Amount",
}
_ALIGN_MAP = {"left": "LEFT", "center": "CENTER", "right": "RIGHT"}
_PARA_ALIGN = {"LEFT": TA_LEFT, "CENTER": TA_CENTER, "RIGHT": TA_RIGHT}

_TAX_SUMMARY_LABELS = {
    "subtotal": "Subtotal", "discount": "Discount", "cgst": "CGST", "sgst": "SGST", "igst": "IGST",
    "cess": "CESS", "round_off": "Round Off", "shipping": "Shipping", "packing": "Packing Charges",
    "grand_total": "Grand Total", "paid": "Paid", "outstanding": "Outstanding", "balance": "Balance",
}

_FOOTER_LABELS = {
    "thank_you": "", "return_policy": "Return Policy", "exchange_policy": "Exchange Policy",
    "warranty": "Warranty Information", "terms_conditions": "Terms & Conditions", "business_notes": "",
}


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


def _custom_qr_bytes(url: str) -> bytes | None:
    """Fetch a tenant-uploaded QR image. Fails soft — a blocked or missing image must never take
    the whole bill down with it; the caller falls back to generating the QR."""
    try:
        if url.startswith("/uploads/"):
            path = (Path("uploads") / url[len("/uploads/"):]).resolve()
            root = Path("uploads").resolve()
            if root not in path.parents:
                return None
            return path.read_bytes() if path.is_file() else None
        # Only our own blob host reaches here — the config validator rejects anything else.
        response = httpx.get(url, timeout=5.0)
        response.raise_for_status()
        return response.content
    except Exception:
        return None


def _qr_for(config, kind: str, data: str, size: float = 22 * mm) -> Image | None:
    """The QR for one type: the tenant's own image when they uploaded one, otherwise generated.

    Falling back to the generated code on any loading failure is deliberate — a bill that prints
    with the wrong-but-working QR beats a bill that prints with no way to pay or reach the
    business at all.
    """
    url = (config.qr_barcode.custom_images or {}).get(kind)
    if url:
        content = _custom_qr_bytes(url)
        if content:
            try:
                return Image(io.BytesIO(content), width=size, height=size)
            except Exception:
                pass
    return _qr_flowable(data, size=size)


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


def _promotion_flowables(
    promo: PromotionConfig,
    config: BillIQPromotionConfig,
    qr_url: str | None,
    is_thermal: bool,
    page_width: float,
    font_scale_percent: int,
) -> list:
    """The RevGenAI lead-gen footer — always appended last (see call site), after totals, GST,
    signature, and every other required invoice element, per spec: it must never displace or be
    mistaken for legal/financial invoice content."""
    if not config.enabled:
        return []

    scale = font_scale_percent / 100
    base_size = _PROMOTION_FONT_SIZES[config.font_size] * scale
    align = _ALIGN_MAP.get(config.alignment, "CENTER")
    gap = _PROMOTION_SPACING_MM[config.spacing] * mm

    title_style = ParagraphStyle(
        "PromoTitle", fontName="Helvetica-Bold", fontSize=base_size + 1, leading=(base_size + 1) * 1.3, alignment=_PARA_ALIGN[align],
    )
    body_style = ParagraphStyle(
        "PromoBody", fontName="Helvetica", fontSize=base_size, leading=base_size * 1.3,
        textColor=colors.HexColor("#4b5563"), alignment=_PARA_ALIGN[align],
    )
    cta_style = ParagraphStyle(
        "PromoCta", fontName="Helvetica-Oblique", fontSize=base_size, leading=base_size * 1.3, alignment=_PARA_ALIGN[align],
    )

    flow: list = []
    if config.separator_line:
        rule = Table([[""]], colWidths=[page_width])
        rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db"))]))
        flow.append(rule)
    flow.append(Spacer(1, gap))

    # Always exactly two text lines (title, then website+phone combined) regardless of paper
    # size or layout — the slogan is an explicit opt-in third line, never mandatory. Keeping the
    # footer's footprint fixed and small was the whole point of this format; "layout" now only
    # controls the banner border below, not how many lines the identity block takes.
    flow.append(Paragraph(xml_escape(promo.title), title_style))
    if config.show_description:
        flow.append(Paragraph(xml_escape(promo.description), body_style))
    flow.append(Paragraph(xml_escape(f"{promo.website} · {promo.phone}"), body_style))

    if config.qr_enabled and qr_url:
        qr = _qr_flowable(qr_url, size=16 * mm if is_thermal else 20 * mm)
        if qr:
            flow.append(Spacer(1, gap))
            qr_row = Table([[qr]], colWidths=[page_width])
            qr_row.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
            flow.append(qr_row)

    if not is_thermal and config.layout == "banner":
        flow.append(Spacer(1, gap))
        flow.append(Paragraph(xml_escape(promo.cta_text), cta_style))

    if config.layout == "banner" and not is_thermal:
        banner = Table([[flow]], colWidths=[page_width])
        banner.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#6C47FF")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
                ]
            )
        )
        return [banner]

    return flow


_PAYMENT_QR_SIZE_MM = {"sm": 16, "md": 22, "lg": 30}


def _payment_qr_flowables(config, data, settings, tenant, styles) -> list:
    """The Payment QR element, or nothing at all.

    Returns an empty list rather than an unpayable QR when the tenant has no merchant VPA, or
    when the bill has nothing left to pay and the element is set to hide on settled invoices —
    a scannable QR on a paid bill is an invitation to pay twice.
    """
    qr_config = config.payment_qr
    enabled = payment_qr_enabled(config.qr_barcode.payment_qr, qr_config.enabled)
    outstanding = data.totals.get("outstanding")
    grand_total = data.totals.get("grand_total", 0) or 0
    # An invoice with no explicit outstanding figure is unpaid in full as far as the QR is
    # concerned — that is the ordinary "here is your bill, please pay it" case.
    amount_due = outstanding if outstanding is not None else grand_total
    vpa = settings.upi_vpa if settings else None
    precision = settings.decimal_precision if settings else 2

    if not should_render_payment_qr(
        enabled=enabled, visibility=qr_config.visibility, amount_due=amount_due, vpa=vpa
    ):
        return []

    amount = amount_due if qr_config.show_amount else None
    uri = build_upi_uri(
        vpa=vpa,
        payee_name=(settings.upi_merchant_name if settings else None) or tenant.company_name,
        amount=amount,
        transaction_ref=data.number,
        transaction_note=f"Invoice {data.number}",
    )
    image = _qr_for(config, "payment_qr", uri, size=_PAYMENT_QR_SIZE_MM[qr_config.size] * mm)
    if not image:
        return []

    flowables = [image]
    caption_lines = []
    if qr_config.label:
        caption_lines.append(xml_escape(qr_config.label))
    if qr_config.show_amount and amount_due > 0:
        caption_lines.append(f"Amount: {format_amount(amount_due, precision)}")
    if qr_config.show_upi_id:
        caption_lines.append(xml_escape(vpa or ""))
    if qr_config.show_payment_status:
        caption_lines.append("Paid" if amount_due <= 0 else f"Outstanding: {format_amount(amount_due, precision)}")
    if caption_lines:
        flowables.append(Paragraph("<br/>".join(caption_lines), styles["Center"] if "Center" in styles else styles["Normal"]))
    return flowables


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


def render_document_pdf(
    data: DocumentData,
    tenant: Tenant,
    settings: Settings | None,
    config: InvoiceTemplateConfig,
    promotion: PromotionConfig | None = None,
    promotion_qr_url: str | None = None,
    # Per-tenant "QR Payments" module toggle. Defaults to True so any caller that renders a
    # document outside a tenant request context behaves as it did before the flag existed.
    qr_payments_enabled: bool = True,
) -> bytes:
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
        logo = logo_flowable(settings.logo_url, max_width=logo_size * 2, max_height=logo_size)
        if logo:
            story.append(logo)
            story.append(Spacer(1, 2 * mm))

    if b.show_business_name:
        name_scale = {"sm": 0.8, "md": 1.0, "lg": 1.3}.get(b.business_name_size, 1.0)
        business_style = ParagraphStyle(
            "Business",
            parent=styles["Title"],
            textColor=primary,
            fontSize=styles["Title"].fontSize * name_scale,
            leading=styles["Title"].leading * name_scale,
        )
        story.append(Paragraph(xml_escape(tenant.company_name), business_style))
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
        flow = _qr_for(config, "invoice_qr", f"Invoice:{data.number}|Amount:{data.totals.get('grand_total', 0):.2f}")
        if flow:
            qr_flowables.append(flow)
    if qr.website_qr and settings and settings.website:
        flow = _qr_for(config, "website_qr", settings.website)
        if flow:
            qr_flowables.append(flow)
    if qr.feedback_qr and settings and settings.feedback_url:
        flow = _qr_for(config, "feedback_qr", settings.feedback_url)
        if flow:
            qr_flowables.append(flow)
    if qr.business_qr:
        flow = _qr_for(config, "business_qr", f"{tenant.company_name}\n{tenant.phone or ''}\n{tenant.email or ''}")
        if flow:
            qr_flowables.append(flow)
    payment_qr_flow = (
        _payment_qr_flowables(config, data, settings, tenant, styles) if qr_payments_enabled else []
    )
    if payment_qr_flow and config.payment_qr.position == "payment_section":
        qr_flowables.extend(payment_qr_flow)
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

    if payment_qr_flow and config.payment_qr.position == "footer":
        story.append(Spacer(1, 6 * mm))
        for flow in payment_qr_flow:
            story.append(flow)

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

    # --- BillIQ Promotion (RevGenAI lead-gen footer) ---
    # Always last: after totals, GST, footer, and signature, so it never displaces required
    # invoice content. Silently omitted if the central content row hasn't been seeded (e.g. a
    # test DB without the promotion migration applied) rather than failing PDF generation.
    if promotion is not None:
        is_thermal = config.paper.size in ("58mm", "80mm")
        promo_flowables = _promotion_flowables(
            promotion, config.billiq_promotion, promotion_qr_url, is_thermal, pagesize[0], config.paper.font_scale_percent
        )
        story.extend(promo_flowables)

    doc.build(story)
    return buffer.getvalue()
