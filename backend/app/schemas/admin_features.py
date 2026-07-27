from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

Category = Literal["core", "business", "ai", "premium"]
FlagStatus = Literal["enabled", "disabled", "suspended"]
AccessLevel = Literal["full_access", "read_only"]


class ConfigFieldSchema(BaseModel):
    key: str
    label: str
    type: str
    default: Any = None


class TenantFeatureItem(BaseModel):
    module_key: str
    label: str
    description: str
    category: Category
    is_implemented: bool
    always_on: bool
    requires: list[str]
    min_version: str
    version_gated: bool
    config_schema: list[ConfigFieldSchema]
    status: FlagStatus
    hidden_from_nav: bool
    access_level: AccessLevel
    config: dict[str, Any] | None = None
    is_custom: bool
    updated_at: datetime | None = None
    updated_by_admin_name: str | None = None
    reason: str | None = None


class FeatureUpdateRequest(BaseModel):
    status: FlagStatus | None = None
    hidden_from_nav: bool | None = None
    access_level: AccessLevel | None = None
    config: dict[str, Any] | None = None
    reason: str | None = None
    force: bool = False


class FeatureImpactResponse(BaseModel):
    module_key: str
    target_status: FlagStatus
    affected_dependents: list[str]
    data_impact: str
    blocked: bool
    block_reason: str | None = None
    requires_confirmation: bool


class BulkFeatureUpdateRequest(BaseModel):
    tenant_ids: list[str]
    module_key: str
    status: FlagStatus
    reason: str | None = None


class BulkUpdateResult(BaseModel):
    updated: list[str]
    skipped: list[dict[str, str]]


class FeatureTemplateModule(BaseModel):
    module_key: str
    status: FlagStatus = "enabled"
    config: dict[str, Any] | None = None


class FeatureTemplateItem(BaseModel):
    id: str
    name: str
    description: str | None = None
    modules: list[FeatureTemplateModule]
    is_system: bool
    created_by_admin_name: str | None = None
    created_at: datetime
    updated_at: datetime


class FeatureTemplateCreateRequest(BaseModel):
    name: str
    description: str | None = None
    modules: list[FeatureTemplateModule]


class TemplateAssignRequest(BaseModel):
    tenant_ids: list[str]
    reason: str | None = None


class FeatureHistoryItem(BaseModel):
    id: str
    tenant_id: str
    module_key: str
    action: str
    previous_state: dict[str, Any] | None = None
    new_state: dict[str, Any] | None = None
    changed_by_admin_name: str
    reason: str | None = None
    created_at: datetime


class FeatureScheduleCreateRequest(BaseModel):
    module_key: str
    action: Literal["enabled", "disabled", "suspended"]
    scheduled_for: datetime


class FeatureScheduleItem(BaseModel):
    id: str
    tenant_id: str
    module_key: str
    action: str
    scheduled_for: datetime
    status: str
    created_by_admin_name: str
    created_at: datetime
    applied_at: datetime | None = None


class FeatureSummaryResponse(BaseModel):
    total_customers: int
    active_customers: int
    customers_with_custom_features: int
    default_configuration_customers: int
    modules_enabled_today: int
    modules_disabled_today: int


class CustomerFeaturePanelItem(BaseModel):
    tenant_id: str
    company_name: str
    industry: str | None = None
    plan: str
    status: str
    subscription_status: str
    is_trial: bool
    country: str
    app_version: str
    modules_enabled_count: int
    has_custom_features: bool
    last_login: datetime | None = None
    created_at: datetime
    trial_ends_at: datetime | None = None


class FeatureAnalyticsResponse(BaseModel):
    most_enabled: list[dict[str, Any]]
    least_enabled: list[dict[str, Any]]
    adoption_rate: list[dict[str, Any]]
    premium_usage: list[dict[str, Any]]
    ai_usage: list[dict[str, Any]]
    customers_by_plan: list[dict[str, Any]]
    customers_by_module_count: list[dict[str, Any]]
