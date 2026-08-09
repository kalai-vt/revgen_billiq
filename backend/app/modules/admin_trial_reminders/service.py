"""PHASE 15-17 of the trial/subscription spec: admin-triggered (never automatic — the daily cron's
own trial-ending-soon notification is a separate, in-app-only mechanism, see
app/modules/internal_cron/service.py) trial reminders over SMS/WhatsApp/Email, with per-channel
delivery history.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.email.factory import get_email_provider
from app.core.email.protocol import EmailMessage, EmailSendError
from app.core.reminder_templates import build_context, render_email, render_sms, render_whatsapp
from app.core.sms.factory import get_sms_provider
from app.core.sms.protocol import SmsMessage, SmsSendError
from app.core.timeutils import as_aware_utc
from app.core.whatsapp.factory import get_whatsapp_provider
from app.core.whatsapp.protocol import WhatsAppMessage, WhatsAppSendError
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.models.user import User
from app.models_admin.trial_reminder import TrialReminderLog

CHANNELS = ("sms", "whatsapp", "email")


class TrialReminderError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _now() -> datetime:
    return datetime.now(timezone.utc)


def send_trial_reminder(
    db: Session,
    admin_db: Session,
    tenant_id: str,
    *,
    channels: list[str],
    admin_id: str,
    admin_name: str,
    admin_contact: str = "",
) -> list[dict[str, Any]]:
    if not channels:
        raise TrialReminderError(400, "Select at least one channel (SMS, WhatsApp, or Email)")
    invalid = [c for c in channels if c not in CHANNELS]
    if invalid:
        raise TrialReminderError(400, f"Invalid channel(s): {', '.join(invalid)}")

    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise TrialReminderError(404, "Customer not found")
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise TrialReminderError(404, "Settings not found for this customer")
    if settings_row.trial_ends_at is None:
        raise TrialReminderError(400, "This customer has no active trial to remind about")

    owner = db.query(User).filter(User.tenant_id == tenant_id, User.role == "owner").first()
    customer_name = f"{owner.first_name} {owner.last_name}".strip() if owner else tenant.company_name

    trial_ends_at = as_aware_utc(settings_row.trial_ends_at)
    days_remaining = max((trial_ends_at - _now()).days, 0)
    context = build_context(
        customer_name=customer_name,
        business_name=tenant.company_name,
        trial_end_date=trial_ends_at,
        days_remaining=days_remaining,
        admin_contact=admin_contact,
    )

    results: list[dict[str, Any]] = []
    for channel in channels:
        status, provider_message_id, failure_reason = "sent", None, None
        try:
            if channel == "email":
                subject, body = render_email(context)
                if not tenant.email:
                    raise EmailSendError("Customer has no email on file")
                get_email_provider().send(EmailMessage(to=tenant.email, subject=subject, html_body=body.replace("\n", "<br>"), text_body=body))
            elif channel == "sms":
                if not tenant.phone:
                    raise SmsSendError("Customer has no phone number on file")
                result = get_sms_provider().send(SmsMessage(to=tenant.phone, body=render_sms(context)))
                provider_message_id = result.provider_message_id
            else:  # whatsapp
                if not tenant.phone:
                    raise WhatsAppSendError("Customer has no phone number on file")
                result = get_whatsapp_provider().send(WhatsAppMessage(to=tenant.phone, body=render_whatsapp(context)))
                provider_message_id = result.provider_message_id
        except (EmailSendError, SmsSendError, WhatsAppSendError) as exc:
            status, failure_reason = "failed", exc.message

        log_row = TrialReminderLog(
            tenant_id=tenant_id,
            company_name=tenant.company_name,
            channel=channel,
            sent_by_admin_id=admin_id,
            sent_by_admin_name=admin_name,
            status=status,
            provider_message_id=provider_message_id,
            failure_reason=failure_reason,
        )
        admin_db.add(log_row)
        results.append(
            {
                "channel": channel,
                "status": status,
                "provider_message_id": provider_message_id,
                "failure_reason": failure_reason,
            }
        )
    admin_db.commit()
    return results


def list_reminder_history(admin_db: Session, tenant_id: str) -> list[TrialReminderLog]:
    return (
        admin_db.query(TrialReminderLog)
        .filter(TrialReminderLog.tenant_id == tenant_id)
        .order_by(TrialReminderLog.created_at.desc())
        .all()
    )


def last_reminder_sent_at(admin_db: Session, tenant_ids: list[str]) -> dict[str, datetime]:
    """One query for the fleet dashboard (PHASE 21's "Last Reminder" column) rather than N+1."""
    if not tenant_ids:
        return {}
    rows = (
        admin_db.query(TrialReminderLog.tenant_id, TrialReminderLog.created_at)
        .filter(TrialReminderLog.tenant_id.in_(tenant_ids), TrialReminderLog.status == "sent")
        .order_by(TrialReminderLog.created_at.desc())
        .all()
    )
    latest: dict[str, datetime] = {}
    for tid, created_at in rows:
        if tid not in latest:
            latest[tid] = created_at
    return latest
