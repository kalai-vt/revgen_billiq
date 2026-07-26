from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    type: str
    severity: str
    title: str
    message: str
    tenant_id: str | None
    created_at: datetime
    is_read: bool
