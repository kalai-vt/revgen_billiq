from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AdminAuditLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    admin_user_id: str
    admin_user_name: str
    action: str
    target_type: str | None
    target_id: str | None
    details: dict | None
    created_at: datetime


class AdminAuditLogPage(BaseModel):
    items: list[AdminAuditLogOut]
    total: int
