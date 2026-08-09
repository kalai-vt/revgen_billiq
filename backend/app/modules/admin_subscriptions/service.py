from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.limits import LIMIT_KEYS, get_effective_limits
from app.core.plans import PLAN_IDS, get_plan
from app.core.timeutils import as_aware_utc, days_remaining as _days_remaining
from app.models.settings import Settings
from app.models.subscription_event import SubscriptionEvent
from app.models.tenant import Tenant
from app.models.subscription_payment import SubscriptionPayment
from app.models.tenant_limit import TenantLimitOverride
from app.modules.admin_features.service import reset_to_plan_defaults

SUBSCRIPTION_STATUSES = ("trialing", "active", "suspended", "expired", "cancelled")

# Basic and Advanced are the two platform-defined tiers with a real default module set (see
# PLAN_DEFAULT_MODULES in feature_catalog.py) — assigning a tenant to one of them should mean
# exactly that tier's modules, not whatever this tenant's TenantFeatureFlag overrides happened to
# be left at from before (e.g. a leftover "advance"-tier override surviving a downgrade to
# "basic"). Custom is deliberately excluded: its entire purpose is that the admin hand-picks
# modules per-tenant (PHASE 10 of the trial/subscription spec), so setting a tenant to "custom"
# must never touch their existing overrides.
_PLANS_WITH_ENFORCED_DEFAULTS = ("basic", "advance")


def _reset_features_for_plan_change(db: Session, tenant_id: str, plan: str, *, admin_id: str, admin_name: str) -> None:
    if plan not in _PLANS_WITH_ENFORCED_DEFAULTS:
        return
    reset_to_plan_defaults(
        db, tenant_id, admin_id=admin_id, admin_name=admin_name, reason=f"Plan changed to {plan}: reset to plan defaults"
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AdminSubscriptionError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _price_for(plan_id: str) -> int:
    return get_plan(plan_id)["price_inr"]


# PHASE 21 dashboard filters. "expiring_soon" mirrors the cron's own 3-day warning window
# (internal_cron/service.py TRIAL_WARNING_WINDOW) so the admin filter and the automatic warning
# notification agree on what "soon" means.
DASHBOARD_FILTERS = ("all", "trial", "expiring_soon", "expired", "suspended", "active")


def list_subscriptions(db: Session, status_filter: str = "all") -> list[dict[str, Any]]:
    rows = (
        db.query(Tenant, Settings)
        .join(Settings, Settings.tenant_id == Tenant.id)
        .filter(Tenant.is_deleted.is_(False))
        .order_by(Tenant.created_at.desc())
        .all()
    )
    now = _now()
    items = []
    for tenant, settings_row in rows:
        days_left = _days_remaining(settings_row.trial_ends_at)
        is_trialing = settings_row.subscription_status == "trialing"
        is_expiring_soon = is_trialing and days_left is not None and days_left <= 3
        if status_filter == "trial" and not is_trialing:
            continue
        if status_filter == "expiring_soon" and not is_expiring_soon:
            continue
        if status_filter in ("expired", "suspended", "active") and settings_row.subscription_status != status_filter:
            continue
        items.append(
            {
                "tenant_id": tenant.id,
                "company_name": tenant.company_name,
                "owner_email": tenant.email,
                "plan": settings_row.plan,
                "price_inr": _price_for(settings_row.plan),
                "subscription_status": settings_row.subscription_status,
                "trial_started_at": settings_row.trial_started_at,
                "trial_ends_at": settings_row.trial_ends_at,
                "days_remaining": days_left,
                "suspension_reason": settings_row.suspension_reason,
                "created_at": tenant.created_at,
            }
        )
    return items


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
    payments = (
        db.query(SubscriptionPayment)
        .filter(SubscriptionPayment.tenant_id == tenant_id)
        .order_by(SubscriptionPayment.created_at.desc())
        .limit(20)
        .all()
    )
    return {
        "tenant_id": tenant.id,
        "company_name": tenant.company_name,
        "plan": settings_row.plan,
        "price_inr": _price_for(settings_row.plan),
        "subscription_status": settings_row.subscription_status,
        "payments": payments,
        "trial_started_at": settings_row.trial_started_at,
        "trial_ends_at": settings_row.trial_ends_at,
        "days_remaining": _days_remaining(settings_row.trial_ends_at),
        "subscription_started_at": settings_row.subscription_started_at,
        "subscription_ends_at": settings_row.subscription_ends_at,
        "suspended_at": settings_row.suspended_at,
        "suspension_reason": settings_row.suspension_reason,
        "reactivated_at": settings_row.reactivated_at,
        "reactivated_by": settings_row.reactivated_by,
        "history": history,
    }


def update_subscription(
    db: Session,
    tenant_id: str,
    *,
    admin_id: str | None = None,
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

    if plan is not None and plan not in PLAN_IDS:
        raise AdminSubscriptionError(400, "Invalid plan")
    if subscription_status is not None and subscription_status not in SUBSCRIPTION_STATUSES:
        raise AdminSubscriptionError(400, f"Invalid status. Must be one of: {', '.join(SUBSCRIPTION_STATUSES)}")

    from_plan, from_status = settings_row.plan, settings_row.subscription_status
    event_type = event_type_override or "updated"
    plan_changed = plan is not None and plan != settings_row.plan

    if plan_changed:
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
    if plan_changed and admin_id is not None:
        _reset_features_for_plan_change(db, tenant_id, plan, admin_id=admin_id, admin_name=changed_by)
    return get_subscription(db, tenant_id)


def suspend_subscription(db: Session, tenant_id: str, *, changed_by: str, note: str | None = None) -> dict[str, Any]:
    """Admin-initiated suspend of an active/trialing account (PHASE 14: the [Suspend Account]
    action available while ACTIVE) — distinct from the automatic trial-expiry suspension in
    app/core/subscription_access.py, which sets suspension_reason="TRIAL_EXPIRED" instead."""
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSubscriptionError(404, "Customer not found")
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise AdminSubscriptionError(404, "Settings not found for this customer")

    from_status = settings_row.subscription_status
    settings_row.subscription_status = "suspended"
    settings_row.suspended_at = _now()
    settings_row.suspension_reason = "ADMIN_SUSPENDED"
    db.add(settings_row)
    db.add(
        SubscriptionEvent(
            tenant_id=tenant_id,
            event_type="suspended",
            from_plan=settings_row.plan,
            to_plan=settings_row.plan,
            from_status=from_status,
            to_status="suspended",
            note=note,
            changed_by=changed_by,
        )
    )
    db.commit()
    return get_subscription(db, tenant_id)


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


def activate_subscription(
    db: Session,
    tenant_id: str,
    *,
    plan: str,
    changed_by: str,
    admin_id: str,
    subscription_ends_at: datetime | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """PHASE 13 of the trial/subscription spec: the admin workflow after a customer pays —
    "Customer -> Subscription -> Select Plan -> Confirm Payment -> Activate/Reactivate". Used both
    the first time a trial converts to paid and any time a suspended/expired account is reactivated
    — same fields, same event type, regardless of which state it's coming from. Never touches any
    other table: existing invoices/customers/products/inventory/payments are untouched by design
    (see PHASE 24, data safety) — this only changes the one Settings row's billing state.
    """
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminSubscriptionError(404, "Customer not found")
    settings_row = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    if not settings_row:
        raise AdminSubscriptionError(404, "Settings not found for this customer")
    if plan not in PLAN_IDS:
        raise AdminSubscriptionError(400, "Invalid plan")

    now = _now()
    from_plan, from_status = settings_row.plan, settings_row.subscription_status

    settings_row.plan = plan
    settings_row.subscription_status = "active"
    settings_row.subscription_started_at = now
    settings_row.subscription_ends_at = subscription_ends_at
    settings_row.trial_ends_at = None
    settings_row.suspended_at = None
    settings_row.suspension_reason = None
    settings_row.reactivated_at = now
    settings_row.reactivated_by = changed_by
    db.add(settings_row)
    db.add(
        SubscriptionEvent(
            tenant_id=tenant_id,
            event_type="activated",
            from_plan=from_plan,
            to_plan=plan,
            from_status=from_status,
            to_status="active",
            note=note,
            changed_by=changed_by,
        )
    )
    db.commit()
    # Unconditional on plan actually changing (unlike update_subscription's plan_changed guard) —
    # activation is inherently a fresh-state moment (PHASE 13: post-payment activate/reactivate),
    # and can legitimately re-select the same plan a suspended/expired tenant was already on. Any
    # module overrides that accumulated before the lapse shouldn't survive a fresh activation.
    _reset_features_for_plan_change(db, tenant_id, plan, admin_id=admin_id, admin_name=changed_by)
    return get_subscription(db, tenant_id)


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
