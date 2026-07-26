from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SubscriptionListItem(BaseModel):
    tenant_id: str
    company_name: str
    plan: str
    price_inr: int
    subscription_status: str
    trial_ends_at: datetime | None
    created_at: datetime


class SubscriptionEventOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    event_type: str
    from_plan: str | None
    to_plan: str | None
    from_status: str | None
    to_status: str | None
    note: str | None
    changed_by: str
    created_at: datetime


class SubscriptionDetail(BaseModel):
    tenant_id: str
    company_name: str
    plan: str
    price_inr: int
    subscription_status: str
    trial_ends_at: datetime | None
    history: list[SubscriptionEventOut]


class SubscriptionUpdateRequest(BaseModel):
    plan: str | None = None
    subscription_status: str | None = None
    trial_ends_at: datetime | None = None
    clear_trial: bool = False
    note: str | None = None
