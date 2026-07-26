from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.returns import Return
from app.models.sales import Invoice
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.modules.invoice_designer import document_data, service as invoice_designer_service
from app.modules.invoice_designer.pdf_renderer import render_document_pdf


def render_invoice_pdf(invoice: Invoice, tenant: Tenant, settings: Settings | None, db: Session) -> bytes:
    decimal_precision = settings.decimal_precision if settings else 2
    data = document_data.build_invoice_data(invoice, db, decimal_precision)
    template = invoice_designer_service.get_or_create_default(db, tenant.id, "tax_invoice")
    config = invoice_designer_service.resolve_config(template)
    return render_document_pdf(data, tenant, settings, config)


def render_return_pdf(ret: Return, invoice: Invoice, tenant: Tenant, settings: Settings | None, db: Session) -> bytes:
    decimal_precision = settings.decimal_precision if settings else 2
    data = document_data.build_return_data(ret, invoice, db, decimal_precision)
    template = invoice_designer_service.get_or_create_default(db, tenant.id, "credit_note")
    config = invoice_designer_service.resolve_config(template)
    return render_document_pdf(data, tenant, settings, config)
