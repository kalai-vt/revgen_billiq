from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.invoice_template import InvoiceTemplate
from app.models.user import User
from app.modules.invoice_designer import service
from app.modules.invoice_designer.service import InvoiceTemplateError
from app.schemas.invoice_template import DocumentType, InvoiceTemplateCreate, InvoiceTemplateOut, InvoiceTemplateUpdate

router = APIRouter(prefix="/api/invoice-templates", tags=["invoice-designer"])


def _out(template: InvoiceTemplate) -> dict[str, Any]:
    data = InvoiceTemplateOut.model_validate(
        {
            "id": template.id,
            "tenant_id": template.tenant_id,
            "document_type": template.document_type,
            "name": template.name,
            "is_default": template.is_default,
            "is_builtin": template.is_builtin,
            "config": service.resolve_config(template),
        }
    )
    return data.model_dump(mode="json")


def _get_or_404(db: Session, tenant_id: str, template_id: str) -> InvoiceTemplate:
    template = service.get_template(db, tenant_id, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Invoice template not found")
    return template


@router.get("")
def list_templates(
    document_type: DocumentType | None = Query(default=None),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    templates = service.list_templates(db, current_user.tenant_id, document_type)
    return make_response(True, "Invoice templates loaded", [_out(t) for t in templates])


@router.get("/defaults")
def get_defaults(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    by_type = service.get_defaults_by_type(db, current_user.tenant_id)
    return make_response(True, "Default templates loaded", {k: _out(v) for k, v in by_type.items()})


@router.get("/{template_id}")
def get_template(
    template_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    template = _get_or_404(db, current_user.tenant_id, template_id)
    return make_response(True, "Invoice template loaded", _out(template))


@router.post("")
def create_template(
    payload: InvoiceTemplateCreate,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        template = service.create_template(
            db, current_user.tenant_id, payload.document_type, payload.name, payload.config
        )
    except InvoiceTemplateError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Invoice template created", _out(template))


@router.post("/{template_id}/duplicate")
def duplicate_template(
    template_id: str,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    template = _get_or_404(db, current_user.tenant_id, template_id)
    copy = service.duplicate_template(db, current_user.tenant_id, template)
    return make_response(True, "Invoice template duplicated", _out(copy))


@router.put("/{template_id}")
def update_template(
    template_id: str,
    payload: InvoiceTemplateUpdate,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    template = _get_or_404(db, current_user.tenant_id, template_id)
    try:
        template = service.update_template(db, template, payload.name, payload.config)
    except InvoiceTemplateError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Invoice template updated", _out(template))


@router.delete("/{template_id}")
def delete_template(
    template_id: str,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    template = _get_or_404(db, current_user.tenant_id, template_id)
    try:
        service.delete_template(db, current_user.tenant_id, template)
    except InvoiceTemplateError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Invoice template deleted")


@router.post("/{template_id}/set-default")
def set_default_template(
    template_id: str,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    template = _get_or_404(db, current_user.tenant_id, template_id)
    template = service.set_default(db, current_user.tenant_id, template)
    return make_response(True, "Default invoice template updated", _out(template))
