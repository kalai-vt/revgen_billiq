from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SendReminderRequest(BaseModel):
    channels: list[str]


class ReminderResult(BaseModel):
    channel: str
    status: str
    provider_message_id: str | None
    failure_reason: str | None


class ReminderLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    tenant_id: str
    company_name: str
    channel: str
    template: str
    sent_by_admin_name: str
    status: str
    provider_message_id: str | None
    failure_reason: str | None
    created_at: datetime
