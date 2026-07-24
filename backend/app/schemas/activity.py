from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ActivityLogOut(BaseModel):
    id: str
    module: str
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    description: str
    user_id: str | None = None
    user_name: str = ""
    created_at: datetime


class ActivityLogListOut(BaseModel):
    items: list[ActivityLogOut]
    total: int
    page: int
    page_size: int
