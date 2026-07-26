from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.tenant import Tenant
from app.modules.billing_plans.service import get_usage

AT_RISK_THRESHOLD_PCT = 80.0


def _resource_usage(entry: dict[str, Any]) -> dict[str, Any]:
    used, limit = entry["used"], entry["limit"]
    pct = round((used / limit) * 100, 1) if limit else None
    return {"used": used, "limit": limit, "pct_used": pct}


def list_usage_analytics(db: Session, only_at_risk: bool = False) -> list[dict[str, Any]]:
    tenants = db.query(Tenant).filter(Tenant.is_deleted.is_(False)).order_by(Tenant.company_name.asc()).all()
    results: list[dict[str, Any]] = []
    for tenant in tenants:
        usage = get_usage(db, tenant)
        resources = {key: _resource_usage(entry) for key, entry in usage["usage"].items()}
        pct_values = [r["pct_used"] for r in resources.values() if r["pct_used"] is not None]
        max_pct = max(pct_values) if pct_values else None
        at_risk = max_pct is not None and max_pct >= AT_RISK_THRESHOLD_PCT

        if only_at_risk and not at_risk:
            continue

        results.append(
            {
                "tenant_id": tenant.id,
                "company_name": tenant.company_name,
                "plan": usage["plan"],
                "users": resources["users"],
                "products": resources["products"],
                "customers": resources["customers"],
                "monthly_invoices": resources["monthly_invoices"],
                "max_pct_used": max_pct,
                "at_risk": at_risk,
            }
        )
    results.sort(key=lambda row: (row["max_pct_used"] is None, -(row["max_pct_used"] or 0)))
    return results
