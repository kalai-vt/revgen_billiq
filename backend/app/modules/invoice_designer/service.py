from __future__ import annotations

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.invoice_template import DOCUMENT_TYPES, InvoiceTemplate
from app.modules.invoice_designer import defaults
from app.schemas.invoice_template import InvoiceTemplateConfig


class InvoiceTemplateError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def resolve_config(template: InvoiceTemplate) -> InvoiceTemplateConfig:
    """Validate a stored config blob into the typed shape, filling any section/field missing
    from an older saved row (schema evolution) with its default rather than erroring."""
    try:
        return InvoiceTemplateConfig.model_validate(template.config)
    except ValidationError:
        return defaults.default_template_config()


def _query(db: Session, tenant_id: str):
    return db.query(InvoiceTemplate).filter(InvoiceTemplate.tenant_id == tenant_id)


def list_templates(db: Session, tenant_id: str, document_type: str | None = None) -> list[InvoiceTemplate]:
    query = _query(db, tenant_id)
    if document_type:
        query = query.filter(InvoiceTemplate.document_type == document_type)
    return query.order_by(InvoiceTemplate.document_type, InvoiceTemplate.created_at).all()


def get_template(db: Session, tenant_id: str, template_id: str) -> InvoiceTemplate | None:
    return _query(db, tenant_id).filter(InvoiceTemplate.id == template_id).first()


def get_or_create_default(db: Session, tenant_id: str, document_type: str) -> InvoiceTemplate:
    """The function PDF/print rendering resolves through: returns the tenant's default template
    for this document type, lazily seeding a builtin one on first use so a tenant who never
    opens the designer still gets a sensible, unchanged-or-better rendering."""
    existing = (
        _query(db, tenant_id)
        .filter(InvoiceTemplate.document_type == document_type, InvoiceTemplate.is_default.is_(True))
        .first()
    )
    if existing:
        return existing

    template = InvoiceTemplate(
        tenant_id=tenant_id,
        document_type=document_type,
        name=defaults.builtin_name(document_type),
        is_default=True,
        is_builtin=True,
        config=defaults.builtin_config(document_type).model_dump(mode="json"),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def create_template(
    db: Session, tenant_id: str, document_type: str, name: str, config: InvoiceTemplateConfig | None
) -> InvoiceTemplate:
    if document_type not in DOCUMENT_TYPES:
        raise InvoiceTemplateError(400, f"Unknown document type: {document_type}")
    resolved_config = config if config is not None else defaults.builtin_config(document_type)
    template = InvoiceTemplate(
        tenant_id=tenant_id,
        document_type=document_type,
        name=name,
        is_default=False,
        is_builtin=False,
        config=resolved_config.model_dump(mode="json"),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def duplicate_template(db: Session, tenant_id: str, template: InvoiceTemplate) -> InvoiceTemplate:
    copy = InvoiceTemplate(
        tenant_id=tenant_id,
        document_type=template.document_type,
        name=f"{template.name} (Copy)",
        is_default=False,
        is_builtin=False,
        config=dict(template.config),
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy


def update_template(
    db: Session, template: InvoiceTemplate, name: str | None, config: InvoiceTemplateConfig | None
) -> InvoiceTemplate:
    if template.is_builtin:
        raise InvoiceTemplateError(400, "The built-in default template cannot be edited directly — duplicate it first")
    if name is not None:
        template.name = name
    if config is not None:
        template.config = config.model_dump(mode="json")
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def delete_template(db: Session, tenant_id: str, template: InvoiceTemplate) -> None:
    if template.is_builtin:
        raise InvoiceTemplateError(400, "The built-in default template cannot be deleted")
    if template.is_default:
        remaining = (
            _query(db, tenant_id)
            .filter(InvoiceTemplate.document_type == template.document_type, InvoiceTemplate.id != template.id)
            .order_by(InvoiceTemplate.created_at)
            .first()
        )
        if remaining:
            remaining.is_default = True
            db.add(remaining)
    db.delete(template)
    db.commit()


def set_default(db: Session, tenant_id: str, template: InvoiceTemplate) -> InvoiceTemplate:
    _query(db, tenant_id).filter(
        InvoiceTemplate.document_type == template.document_type, InvoiceTemplate.id != template.id
    ).update({InvoiceTemplate.is_default: False})
    template.is_default = True
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def get_defaults_by_type(db: Session, tenant_id: str) -> dict[str, InvoiceTemplate]:
    return {document_type: get_or_create_default(db, tenant_id, document_type) for document_type in DOCUMENT_TYPES}
