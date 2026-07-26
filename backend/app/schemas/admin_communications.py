from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class BroadcastRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=4000)
    audience_type: str
    plan: str | None = None
    tenant_id: str | None = None


class CommunicationOut(BaseModel):
    id: str
    admin_user_name: str
    subject: str
    message: str
    audience_type: str
    audience_filter: dict | None
    recipient_count: int
    created_at: datetime
