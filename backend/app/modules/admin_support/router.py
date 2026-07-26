from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.models_admin.audit_log import AdminAuditLog
from app.modules.admin_support import service
from app.modules.admin_support.service import AdminSupportError
from app.schemas.admin_support import (
    TicketCreateRequest,
    TicketDetail,
    TicketListItem,
    TicketMessageCreateRequest,
    TicketUpdateRequest,
)

router = APIRouter(prefix="/api/admin/tickets", tags=["admin-support"])


def _log(admin_db: Session, current_admin: AdminUser, action: str, target_id: str, details: dict | None = None) -> None:
    admin_db.add(
        AdminAuditLog(
            admin_user_id=current_admin.id,
            admin_user_name=f"{current_admin.first_name} {current_admin.last_name}",
            action=action,
            target_type="support_ticket",
            target_id=target_id,
            details=details,
        )
    )
    admin_db.commit()


@router.get("")
def list_tickets(
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    tenant_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    rows = service.list_tickets(db, status=status, priority=priority, tenant_id=tenant_id)
    items = [TicketListItem.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Tickets loaded", items)


@router.post("")
def create_ticket(
    payload: TicketCreateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    admin_name = f"{current_admin.first_name} {current_admin.last_name}"
    try:
        ticket = service.create_ticket(
            db,
            tenant_id=payload.tenant_id,
            subject=payload.subject,
            description=payload.description,
            priority=payload.priority,
            created_by_admin_id=current_admin.id,
            created_by_admin_name=admin_name,
        )
    except AdminSupportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log(admin_db, current_admin, "ticket.created", ticket.id, {"subject": payload.subject})
    detail = service.get_ticket(db, ticket.id)
    return make_response(True, "Ticket created", TicketDetail.model_validate(detail).model_dump(mode="json"))


@router.get("/{ticket_id}")
def get_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    try:
        detail = service.get_ticket(db, ticket_id)
    except AdminSupportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Ticket loaded", TicketDetail.model_validate(detail).model_dump(mode="json"))


@router.put("/{ticket_id}")
def update_ticket(
    ticket_id: str,
    payload: TicketUpdateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    assigned_admin_name = None
    if payload.assigned_admin_id is not None:
        assignee = admin_db.get(AdminUser, payload.assigned_admin_id)
        if not assignee:
            raise HTTPException(status_code=404, detail="Assignee admin user not found")
        assigned_admin_name = f"{assignee.first_name} {assignee.last_name}"

    try:
        detail = service.update_ticket(
            db,
            ticket_id,
            status=payload.status,
            priority=payload.priority,
            assigned_admin_id=payload.assigned_admin_id,
            assigned_admin_name=assigned_admin_name,
        )
    except AdminSupportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log(admin_db, current_admin, "ticket.updated", ticket_id, payload.model_dump(exclude_none=True))
    return make_response(True, "Ticket updated", TicketDetail.model_validate(detail).model_dump(mode="json"))


@router.post("/{ticket_id}/messages")
def add_message(
    ticket_id: str,
    payload: TicketMessageCreateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    admin_name = f"{current_admin.first_name} {current_admin.last_name}"
    try:
        detail = service.add_message(db, ticket_id, author_admin_id=current_admin.id, author_name=admin_name, message=payload.message)
    except AdminSupportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log(admin_db, current_admin, "ticket.message_added", ticket_id)
    return make_response(True, "Message added", TicketDetail.model_validate(detail).model_dump(mode="json"))
