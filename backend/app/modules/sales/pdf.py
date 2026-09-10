from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.returns import Return
from app.models.sales import Invoice
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.modules.invoice_designer import document_data, service as invoice_designer_service
from app.modules.invoice_designer.pdf_renderer import render_document_pdf
from app.modules.promotion import service as promotion_service
from app.schemas.invoice_template import InvoiceTemplateConfig


def _qr_payments_enabled(db: Session, tenant_id: str) -> bool:
    """Whether this tenant may show a payment QR at all.

    The Payment QR is granted on every plan (it is ordinary billing, not a premium add-on), but
    it stays individually toggleable per tenant like any other module — so an admin turning
    "QR Payments" off in Feature Management has to actually remove the QR from the printed and
    downloaded invoice, not just hide a settings screen.
    """
    from app.modules.admin_features.service import get_effective_flags_for_tenant

    return get_effective_flags_for_tenant(db, tenant_id).get("qr_payments", True)


def _promotion_args(db: Session, tenant: Tenant, config: InvoiceTemplateConfig):
    """Only touches the promotion table / lazily assigns a tracking id when the tenant's
    template actually has BillIQ Promotion enabled — an invoice PDF for a tenant who's turned
    it off shouldn't mint a tracking id they'll never use."""
    promo = config.billiq_promotion
    if not promo.enabled:
        return None, None
    promotion_content = promotion_service.get_promotion_config(db)
    qr_url = None
    if promo.qr_enabled:
        tracking_id = promotion_service.get_or_create_tracking_id(db, tenant)
        qr_url = promotion_service.build_qr_redirect_url(tracking_id)
    return promotion_content, qr_url


def render_invoice_pdf(invoice: Invoice, tenant: Tenant, settings: Settings | None, db: Session) -> bytes:
    decimal_precision = settings.decimal_precision if settings else 2
    data = document_data.build_invoice_data(invoice, db, decimal_precision)
    template = invoice_designer_service.get_or_create_default(db, tenant.id, "tax_invoice")
    config = invoice_designer_service.resolve_config(template)
    promotion, qr_url = _promotion_args(db, tenant, config)
    return render_document_pdf(
        data, tenant, settings, config, promotion, qr_url, qr_payments_enabled=_qr_payments_enabled(db, tenant.id)
    )


def render_return_pdf(ret: Return, invoice: Invoice, tenant: Tenant, settings: Settings | None, db: Session) -> bytes:
    decimal_precision = settings.decimal_precision if settings else 2
    data = document_data.build_return_data(ret, invoice, db, decimal_precision)
    template = invoice_designer_service.get_or_create_default(db, tenant.id, "credit_note")
    config = invoice_designer_service.resolve_config(template)
    promotion, qr_url = _promotion_args(db, tenant, config)
    return render_document_pdf(
        data, tenant, settings, config, promotion, qr_url, qr_payments_enabled=_qr_payments_enabled(db, tenant.id)
    )
