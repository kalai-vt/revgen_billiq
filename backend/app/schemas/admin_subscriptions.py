from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SubscriptionListItem(BaseModel):
    tenant_id: str
    company_name: str
    owner_email: str
    plan: str
    price_inr: int
    subscription_status: str
    trial_started_at: datetime | None
    trial_ends_at: datetime | None
    days_remaining: int | None
    suspension_reason: str | None
    last_reminder_sent_at: datetime | None = None
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


class SubscriptionPaymentOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    plan: str
    amount_inr: int
    status: str
    created_at: datetime
    paid_at: datetime | None


class SubscriptionDetail(BaseModel):
    tenant_id: str
    company_name: str
    plan: str
    price_inr: int
    subscription_status: str
    trial_started_at: datetime | None
    trial_ends_at: datetime | None
    days_remaining: int | None
    subscription_started_at: datetime | None
    subscription_ends_at: datetime | None
    suspended_at: datetime | None
    suspension_reason: str | None
    reactivated_at: datetime | None
    reactivated_by: str | None
    payments: list[SubscriptionPaymentOut] = []
    history: list[SubscriptionEventOut]


class SubscriptionUpdateRequest(BaseModel):
    plan: str | None = None
    subscription_status: str | None = None
    trial_ends_at: datetime | None = None
    clear_trial: bool = False
    note: str | None = None


class SubscriptionActionRequest(BaseModel):
    note: str | None = None


class ActivateSubscriptionRequest(BaseModel):
    plan: str
    subscription_ends_at: datetime | None = None
    note: str | None = None


class ExtendTrialRequest(BaseModel):
    days: int | None = None
    trial_ends_at: datetime | None = None
    note: str | None = None


class TenantLimitItem(BaseModel):
    limit_key: str
    effective_value: int | None
    plan_default: int | None
    is_overridden: bool


class TenantLimitsOut(BaseModel):
    tenant_id: str
    plan: str
    limits: list[TenantLimitItem]


class LimitOverrideItem(BaseModel):
    limit_key: str
    limit_value: int | None = None
    reset: bool = False


class LimitsUpdateRequest(BaseModel):
    overrides: list[LimitOverrideItem]
