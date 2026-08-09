from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.admin_db import AdminBase


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TrialReminderLog(AdminBase):
    """One row per (customer, channel) reminder send — PHASE 17 of the trial/subscription spec.
    Deliberately separate from `AdminCommunication` (the existing bulk-broadcast log): that model
    is shaped for one message fanned out to many tenants (audience_type + recipient_count); this
    is the opposite — one admin-initiated reminder, to one tenant, tracked per channel with real
    delivery status, since PHASE 15 lets an admin pick multiple channels at once for the same send.
    """

    __tablename__ = "trial_reminder_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    company_name: Mapped[str] = mapped_column(String(255))
    channel: Mapped[str] = mapped_column(String(20))  # sms | whatsapp | email
    template: Mapped[str] = mapped_column(String(100), default="trial_expiry_reminder")
    sent_by_admin_id: Mapped[str] = mapped_column(String(36), ForeignKey("admin_users.id"), index=True)
    sent_by_admin_name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20))  # sent | failed
    provider_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
