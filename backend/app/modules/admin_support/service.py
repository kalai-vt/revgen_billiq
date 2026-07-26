from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.timeutils import utc_now
from app.models.support_ticket import TICKET_PRIORITIES, TICKET_STATUSES, SupportTicket, SupportTicketMessage
from app.models.tenant import Tenant


class AdminSupportError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def create_ticket(
    db: Session, *, tenant_id: str, subject: str, description: str, priority: str, created_by_admin_id: str, created_by_admin_name: str
) -> SupportTicket:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSupportError(404, "Customer not found")
    if priority not in TICKET_PRIORITIES:
        raise AdminSupportError(400, f"Invalid priority. Must be one of: {', '.join(TICKET_PRIORITIES)}")

    ticket = SupportTicket(
        tenant_id=tenant_id,
        subject=subject,
        description=description,
        priority=priority,
        created_by_admin_id=created_by_admin_id,
        created_by_admin_name=created_by_admin_name,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def list_tickets(
    db: Session, *, status: str | None = None, priority: str | None = None, tenant_id: str | None = None
) -> list[dict[str, Any]]:
    query = db.query(SupportTicket, Tenant.company_name).join(Tenant, Tenant.id == SupportTicket.tenant_id)
    if status:
        query = query.filter(SupportTicket.status == status)
    if priority:
        query = query.filter(SupportTicket.priority == priority)
    if tenant_id:
        query = query.filter(SupportTicket.tenant_id == tenant_id)
    rows = query.order_by(SupportTicket.created_at.desc()).all()
    return [
        {
            "id": ticket.id,
            "tenant_id": ticket.tenant_id,
            "company_name": company_name,
            "subject": ticket.subject,
            "status": ticket.status,
            "priority": ticket.priority,
            "assigned_admin_name": ticket.assigned_admin_name,
            "created_at": ticket.created_at,
            "updated_at": ticket.updated_at,
        }
        for ticket, company_name in rows
    ]


def get_ticket(db: Session, ticket_id: str) -> dict[str, Any]:
    row = db.query(SupportTicket, Tenant.company_name).join(Tenant, Tenant.id == SupportTicket.tenant_id).filter(
        SupportTicket.id == ticket_id
    ).first()
    if not row:
        raise AdminSupportError(404, "Ticket not found")
    ticket, company_name = row
    return {
        "id": ticket.id,
        "tenant_id": ticket.tenant_id,
        "company_name": company_name,
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "created_by_admin_name": ticket.created_by_admin_name,
        "assigned_admin_name": ticket.assigned_admin_name,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "resolved_at": ticket.resolved_at,
        "messages": ticket.messages,
    }


def update_ticket(
    db: Session,
    ticket_id: str,
    *,
    status: str | None,
    priority: str | None,
    assigned_admin_id: str | None,
    assigned_admin_name: str | None,
) -> dict[str, Any]:
    ticket = db.get(SupportTicket, ticket_id)
    if not ticket:
        raise AdminSupportError(404, "Ticket not found")
    if status is not None:
        if status not in TICKET_STATUSES:
            raise AdminSupportError(400, f"Invalid status. Must be one of: {', '.join(TICKET_STATUSES)}")
        ticket.status = status
        if status == "resolved" and ticket.resolved_at is None:
            ticket.resolved_at = utc_now()
        elif status != "resolved":
            ticket.resolved_at = None
    if priority is not None:
        if priority not in TICKET_PRIORITIES:
            raise AdminSupportError(400, f"Invalid priority. Must be one of: {', '.join(TICKET_PRIORITIES)}")
        ticket.priority = priority
    if assigned_admin_id is not None:
        ticket.assigned_admin_id = assigned_admin_id
        ticket.assigned_admin_name = assigned_admin_name

    db.add(ticket)
    db.commit()
    return get_ticket(db, ticket_id)


def add_message(db: Session, ticket_id: str, *, author_admin_id: str, author_name: str, message: str) -> dict[str, Any]:
    ticket = db.get(SupportTicket, ticket_id)
    if not ticket:
        raise AdminSupportError(404, "Ticket not found")
    db.add(SupportTicketMessage(ticket_id=ticket_id, author_admin_id=author_admin_id, author_name=author_name, message=message))
    ticket.updated_at = utc_now()
    db.add(ticket)
    db.commit()
    return get_ticket(db, ticket_id)
