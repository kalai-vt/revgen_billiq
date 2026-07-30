from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.notifications import (
    TYPE_LIMIT_APPROACHING,
    TYPE_SUBSCRIPTION_EXPIRY,
    TYPE_TRIAL_ENDING_SOON,
    create_notification,
)
from app.core.timeutils import as_aware_utc, utc_now
from app.models.settings import Settings
from app.models.subscription_event import SubscriptionEvent
from app.models.tenant import Tenant
from app.modules.billing_plans.service import get_usage

TRIAL_WARNING_WINDOW = timedelta(days=3)
LIMIT_WARNING_THRESHOLD = 0.8

# (label, short key for the notification `type` string — that column is String(30), and
# "limit_approaching:" + the usage dict's own key would overflow it for "monthly_invoices").
_USAGE_LABELS: dict[str, tuple[str, str]] = {
    "users": ("team members", "users"),
    "products": ("products", "products"),
    "customers": ("customers", "customers"),
    "monthly_invoices": ("monthly invoices", "invoices"),
    "storage": ("storage", "storage"),
}


def _already_notified_today(db: Session, tenant_id: str, notif_type: str) -> bool:
    from app.models.notification import Notification

    today_start = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    existing = (
        db.query(Notification)
        .filter(Notification.tenant_id == tenant_id, Notification.type == notif_type, Notification.created_at >= today_start)
        .first()
    )
    return existing is not None


def _check_trials(db: Session) -> dict[str, int]:
    now = utc_now()
    expired = 0
    warned = 0
    trialing = db.query(Settings).filter(Settings.subscription_status == "trialing", Settings.trial_ends_at.isnot(None)).all()
    for settings_row in trialing:
        trial_ends_at = as_aware_utc(settings_row.trial_ends_at)
        if trial_ends_at < now:
            from_status = settings_row.subscription_status
            settings_row.subscription_status = "expired"
            db.add(settings_row)
            db.add(
                SubscriptionEvent(
                    tenant_id=settings_row.tenant_id,
                    event_type="expired",
                    from_plan=settings_row.plan,
                    to_plan=settings_row.plan,
                    from_status=from_status,
                    to_status="expired",
                    note="Automatically expired — trial period ended",
                    changed_by="system (scheduled subscription check)",
                )
            )
            create_notification(
                db,
                tenant_id=settings_row.tenant_id,
                type=TYPE_SUBSCRIPTION_EXPIRY,
                title="Your trial has expired",
                message="Your trial period has ended. Contact your administrator to activate a paid plan and keep using RevGen BillIQ.",
            )
            expired += 1
        elif trial_ends_at - now <= TRIAL_WARNING_WINDOW:
            if _already_notified_today(db, settings_row.tenant_id, TYPE_TRIAL_ENDING_SOON):
                continue
            days_left = max((trial_ends_at - now).days, 0)
            create_notification(
                db,
                tenant_id=settings_row.tenant_id,
                type=TYPE_TRIAL_ENDING_SOON,
                title="Your trial is ending soon",
                message=f"Your trial ends in {days_left} day{'s' if days_left != 1 else ''}. Contact your administrator to avoid losing access.",
            )
            warned += 1
    return {"trials_expired": expired, "trial_ending_warnings": warned}


def _check_limits(db: Session) -> dict[str, int]:
    warned = 0
    tenants = db.query(Tenant).filter(Tenant.is_deleted.is_(False)).all()
    for tenant in tenants:
        usage = get_usage(db, tenant)
        for key, (label, short_key) in _USAGE_LABELS.items():
            entry = usage["usage"].get(key)
            if not entry:
                continue
            used, limit = entry["used"], entry["limit"]
            if limit is None or used is None or limit <= 0:
                continue
            if used / limit < LIMIT_WARNING_THRESHOLD:
                continue
            notif_type = f"{TYPE_LIMIT_APPROACHING}:{short_key}"
            if _already_notified_today(db, tenant.id, notif_type):
                continue
            pct = round(used / limit * 100)
            create_notification(
                db,
                tenant_id=tenant.id,
                type=notif_type,
                title=f"Approaching your {label} limit",
                message=f"You're using {pct}% of your plan's {label} limit ({used}/{limit}). Contact your administrator to raise it.",
            )
            warned += 1
    return {"limit_warnings": warned}


def run_subscription_check(db: Session) -> dict[str, Any]:
    """The daily scheduled job (Vercel Cron -> POST /api/internal/cron/subscription-check) that
    replaces what used to be pure lazy/on-request evaluation: expires trials that have run out,
    and warns tenants approaching a trial deadline or a usage limit. Notification spam is avoided
    by a simple once-per-calendar-day-per-type check rather than a stored "already sent" flag —
    consistent with this app's existing bias toward live-computed state over incremental counters.
    """
    trial_results = _check_trials(db)
    limit_results = _check_limits(db)
    db.commit()
    return {**trial_results, **limit_results}
