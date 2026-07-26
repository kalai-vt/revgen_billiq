from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TicketMessageOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    author_name: str
    message: str
    created_at: datetime


class TicketListItem(BaseModel):
    id: str
    tenant_id: str
    company_name: str
    subject: str
    status: str
    priority: str
    assigned_admin_name: str | None
    created_at: datetime
    updated_at: datetime


class TicketDetail(BaseModel):
    id: str
    tenant_id: str
    company_name: str
    subject: str
    description: str
    status: str
    priority: str
    created_by_admin_name: str
    assigned_admin_name: str | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    messages: list[TicketMessageOut]


class TicketCreateRequest(BaseModel):
    tenant_id: str
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    priority: str = "medium"


class TicketUpdateRequest(BaseModel):
    status: str | None = None
    priority: str | None = None
    assigned_admin_id: str | None = None


class TicketMessageCreateRequest(BaseModel):
    message: str = Field(min_length=1)
