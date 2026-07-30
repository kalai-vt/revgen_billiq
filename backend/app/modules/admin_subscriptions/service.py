from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.limits import LIMIT_KEYS, get_effective_limits
from app.core.plans import get_plan
from app.core.timeutils import as_aware_utc
from app.models.settings import Settings
from app.models.subscription_event import SubscriptionEvent
from app.models.tenant import Tenant
from app.models.tenant_limit import TenantLimitOverride

SUBSCRIPTION_STATUSES = ("trialing", "active", "suspended", "expired", "cancelled")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AdminSubscriptionError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _price_for(plan_id: str) -> int:
    return get_plan(plan_id)["price_inr"]


def list_subscriptions(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(Tenant, Settings)
        .join(Settings, Settings.tenant_id == Tenant.id)
        .filter(Tenant.is_deleted.is_(False))
        .order_by(Tenant.created_at.desc())
        .all()
    )
    return [
        {
            "tenant_id": tenant.id,
            "company_name": tenant.company_name,
            "plan": settings_row.plan,
            "price_inr": _price_for(settings_row.plan),
            "subscription_status": settings_row.subscription_status,
            "trial_ends_at": settings_row.trial_ends_at,
            "created_at": tenant.created_at,
        }
        for tenant, settings_row in rows
    ]


def get_subscription(db: Session, tenant_id: str) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSubscriptionError(404, "Customer not found")
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise AdminSubscriptionError(404, "Settings not found for this customer")

    history = (
        db.query(SubscriptionEvent)
        .filter(SubscriptionEvent.tenant_id == tenant_id)
        .order_by(SubscriptionEvent.created_at.desc())
        .all()
    )
    return {
        "tenant_id": tenant.id,
        "company_name": tenant.company_name,
        "plan": settings_row.plan,
        "price_inr": _price_for(settings_row.plan),
        "subscription_status": settings_row.subscription_status,
        "trial_ends_at": settings_row.trial_ends_at,
        "history": history,
    }


def update_subscription(
    db: Session,
    tenant_id: str,
    *,
    changed_by: str,
    plan: str | None,
    subscription_status: str | None,
    trial_ends_at,
    clear_trial: bool,
    note: str | None,
    event_type_override: str | None = None,
) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSubscriptionError(404, "Customer not found")
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise AdminSubscriptionError(404, "Settings not found for this customer")

    if plan is not None and plan not in ("basic", "explore", "advance"):
        raise AdminSubscriptionError(400, "Invalid plan")
    if subscription_status is not None and subscription_status not in SUBSCRIPTION_STATUSES:
        raise AdminSubscriptionError(400, f"Invalid status. Must be one of: {', '.join(SUBSCRIPTION_STATUSES)}")

    from_plan, from_status = settings_row.plan, settings_row.subscription_status
    event_type = event_type_override or "updated"

    if plan is not None and plan != settings_row.plan:
        if event_type_override is None:
            event_type = "upgrade" if _price_for(plan) > _price_for(settings_row.plan) else "downgrade"
        settings_row.plan = plan
    if subscription_status is not None and subscription_status != settings_row.subscription_status:
        if event_type_override is None:
            if subscription_status == "cancelled":
                event_type = "cancelled"
            elif settings_row.subscription_status == "cancelled" and subscription_status == "active":
                event_type = "reactivated"
        settings_row.subscription_status = subscription_status
    if clear_trial:
        settings_row.trial_ends_at = None
    elif trial_ends_at is not None:
        settings_row.trial_ends_at = trial_ends_at

    db.add(settings_row)
    db.add(
        SubscriptionEvent(
            tenant_id=tenant_id,
            event_type=event_type,
            from_plan=from_plan,
            to_plan=settings_row.plan,
            from_status=from_status,
            to_status=settings_row.subscription_status,
            note=note,
            changed_by=changed_by,
        )
    )
    db.commit()
    return get_subscription(db, tenant_id)


def suspend_subscription(db: Session, tenant_id: str, *, changed_by: str, note: str | None = None) -> dict[str, Any]:
    return update_subscription(
        db, tenant_id, changed_by=changed_by, plan=None, subscription_status="suspended",
        trial_ends_at=None, clear_trial=False, note=note, event_type_override="suspended",
    )


def resume_subscription(db: Session, tenant_id: str, *, changed_by: str, note: str | None = None) -> dict[str, Any]:
    return update_subscription(
        db, tenant_id, changed_by=changed_by, plan=None, subscription_status="active",
        trial_ends_at=None, clear_trial=False, note=note, event_type_override="resumed",
    )


def expire_subscription(db: Session, tenant_id: str, *, changed_by: str, note: str | None = None) -> dict[str, Any]:
    return update_subscription(
        db, tenant_id, changed_by=changed_by, plan=None, subscription_status="expired",
        trial_ends_at=None, clear_trial=False, note=note, event_type_override="expired",
    )


def extend_trial(
    db: Session,
    tenant_id: str,
    *,
    changed_by: str,
    days: int | None = None,
    trial_ends_at: datetime | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    if trial_ends_at is None:
        if days is None or days <= 0:
            raise AdminSubscriptionError(400, "Provide either a positive number of days or an explicit trial_ends_at")
        settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
        if not settings_row:
            raise AdminSubscriptionError(404, "Settings not found for this customer")
        current_trial_ends_at = as_aware_utc(settings_row.trial_ends_at) if settings_row.trial_ends_at else None
        base = current_trial_ends_at if (current_trial_ends_at and current_trial_ends_at > _now()) else _now()
        trial_ends_at = base + timedelta(days=days)

    return update_subscription(
        db, tenant_id, changed_by=changed_by, plan=None, subscription_status="trialing",
        trial_ends_at=trial_ends_at, clear_trial=False, note=note, event_type_override="trial_extended",
    )


# ---------------------------------------------------------------------------
# Per-tenant numeric limit overrides
# ---------------------------------------------------------------------------


def get_tenant_limits(db: Session, tenant_id: str) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSubscriptionError(404, "Customer not found")
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise AdminSubscriptionError(404, "Settings not found for this customer")

    plan = get_plan(settings_row.plan)
    effective = get_effective_limits(db, tenant_id)
    overridden_keys = {
        row.limit_key
        for row in db.query(TenantLimitOverride).filter(TenantLimitOverride.tenant_id == tenant_id).all()
    }
    return {
        "tenant_id": tenant_id,
        "plan": settings_row.plan,
        "limits": [
            {
                "limit_key": key,
                "effective_value": effective[key],
                "plan_default": plan[key],  # type: ignore[literal-required]
                "is_overridden": key in overridden_keys,
            }
            for key in LIMIT_KEYS
        ],
    }


def set_tenant_limits(
    db: Session,
    tenant_id: str,
    overrides: list[dict[str, Any]],
    *,
    updated_by: str,
) -> dict[str, Any]:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSubscriptionError(404, "Customer not found")

    existing = {
        row.limit_key: row
        for row in db.query(TenantLimitOverride).filter(TenantLimitOverride.tenant_id == tenant_id).all()
    }
    for item in overrides:
        limit_key = item["limit_key"]
        if limit_key not in LIMIT_KEYS:
            raise AdminSubscriptionError(400, f"Unknown limit key: {limit_key}")
        if item.get("reset"):
            row = existing.get(limit_key)
            if row:
                db.delete(row)
            continue
        row = existing.get(limit_key)
        if row:
            row.limit_value = item.get("limit_value")
            row.updated_by = updated_by
            db.add(row)
        else:
            db.add(
                TenantLimitOverride(
                    tenant_id=tenant_id,
                    limit_key=limit_key,
                    limit_value=item.get("limit_value"),
                    updated_by=updated_by,
                )
            )
    db.commit()
    return get_tenant_limits(db, tenant_id)
