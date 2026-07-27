from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.email.protocol import EmailSendError
from app.core.email.service import send_broadcast_email
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.models.user import User
from app.models_admin.communication import AdminCommunication

AUDIENCE_TYPES = ("all", "plan", "tenant")

logger = logging.getLogger(__name__)


class AdminCommunicationError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _resolve_recipients(db: Session, *, audience_type: str, plan: str | None, tenant_id: str | None) -> list[User]:
    query = db.query(User).join(Tenant, Tenant.id == User.tenant_id).filter(
        User.role == "owner", Tenant.is_deleted.is_(False)
    )
    if audience_type == "tenant":
        if not tenant_id:
            raise AdminCommunicationError(400, "tenant_id is required for the 'tenant' audience")
        query = query.filter(User.tenant_id == tenant_id)
    elif audience_type == "plan":
        if not plan:
            raise AdminCommunicationError(400, "plan is required for the 'plan' audience")
        query = query.join(Settings, Settings.tenant_id == Tenant.id).filter(Settings.plan == plan)
    elif audience_type != "all":
        raise AdminCommunicationError(400, f"Invalid audience_type. Must be one of: {', '.join(AUDIENCE_TYPES)}")
    return query.all()


def send_broadcast(
    db: Session,
    admin_db: Session,
    *,
    admin_id: str,
    admin_name: str,
    subject: str,
    message: str,
    audience_type: str,
    plan: str | None,
    tenant_id: str | None,
) -> dict[str, Any]:
    recipients = _resolve_recipients(db, audience_type=audience_type, plan=plan, tenant_id=tenant_id)

    sent_count = 0
    for recipient in recipients:
        try:
            send_broadcast_email(to=recipient.email, first_name=recipient.first_name, subject_line=subject, message=message)
            sent_count += 1
        except EmailSendError:
            # One bad address/provider hiccup shouldn't stop the rest of the broadcast from going out.
            logger.exception("Failed to send broadcast email to %s", recipient.email)

    audience_filter = {"plan": plan} if plan else ({"tenant_id": tenant_id} if tenant_id else None)
    record = AdminCommunication(
        admin_user_id=admin_id,
        admin_user_name=admin_name,
        subject=subject,
        message=message,
        audience_type=audience_type,
        audience_filter=audience_filter,
        recipient_count=sent_count,
    )
    admin_db.add(record)
    admin_db.commit()
    admin_db.refresh(record)
    return {
        "id": record.id,
        "admin_user_name": record.admin_user_name,
        "subject": record.subject,
        "message": record.message,
        "audience_type": record.audience_type,
        "audience_filter": record.audience_filter,
        "recipient_count": record.recipient_count,
        "created_at": record.created_at,
    }


def list_communications(admin_db: Session, limit: int = 50) -> list[AdminCommunication]:
    return admin_db.query(AdminCommunication).order_by(AdminCommunication.created_at.desc()).limit(limit).all()
