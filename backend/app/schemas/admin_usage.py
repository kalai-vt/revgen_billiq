from __future__ import annotations

from pydantic import BaseModel


class ResourceUsage(BaseModel):
    used: int
    limit: int | None
    pct_used: float | None


class UsageAnalyticsItem(BaseModel):
    tenant_id: str
    company_name: str
    plan: str
    users: ResourceUsage
    products: ResourceUsage
    customers: ResourceUsage
    monthly_invoices: ResourceUsage
    max_pct_used: float | None
    at_risk: bool
