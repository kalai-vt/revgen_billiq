"""Trial lifecycle and subscription-access enforcement.

Two responsibilities live here, both centered on `Settings.subscription_status` /
`trial_ends_at` (the tenant's billing state — distinct from `Tenant.status`, which is the
separate account-level suspend RevGenIQ staff use and is already enforced in `app/core/deps.py`):

1. `start_trial` — called once, at tenant registration, to set up the 14-day trial.
2. `enforce_subscription_access` — called on (almost) every authenticated request. It self-heals
   an overdue trial (flips it to suspended right there, the same instant, rather than waiting for
   the daily cron — see PHASE 4 of the trial/subscription spec: "the backend should treat the
   account as expired/suspended even if the scheduled job has not executed yet") and raises if the
   tenant's current subscription state should block normal app usage.
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.notifications import TYPE_SUBSCRIPTION_EXPIRY, create_notification
from app.core.timeutils import as_aware_utc, utc_now
from app.models.settings import Settings
from app.models.subscription_event import SubscriptionEvent

SUSPENSION_REASON_TRIAL_EXPIRED = "TRIAL_EXPIRED"

# Statuses that block normal app usage outright, with no time-based check needed — reached only
# via an explicit admin action (suspend/expire) or a lapsed paid subscription's end date, never
# automatically from a fresh trial.
_BLOCKING_STATUSES = ("suspended", "expired", "cancelled")

# Path prefixes that must stay reachable even while blocked: auth (so /me, /logout, and the
# suspension screen's own session check keep working), billing (so the tenant can actually pay to
# get unblocked), and the two unauthenticated utility endpoints. Everything else in the tenant app
# — invoices, customers, products, inventory, payments, settings writes, analytics, all of it —
# is blocked, per PHASE 5 of the spec ("do NOT rely on hiding buttons in the frontend").
SUBSCRIPTION_ACCESS_EXEMPT_PREFIXES = ("/api/auth", "/api/billing", "/api/health", "/api/modules")


def start_trial(settings_row: Settings) -> None:
    """Sets up the trial fields on a freshly created tenant's Settings row. Call this instead of
    relying on the column defaults — see app/modules/auth/service.py:register_tenant. Uses server
    time only, never anything client-supplied, and TRIAL_DURATION_DAYS lives in one place
    (REVGENIQ_TRIAL_DURATION_DAYS / app.core.config.Settings.trial_duration_days) rather than
    being hard-coded here or anywhere else.
    """
    now = utc_now()
    settings_row.trial_started_at = now
    settings_row.trial_ends_at = now + timedelta(days=app_settings.trial_duration_days)
    settings_row.subscription_status = "trialing"


def is_trial_overdue(settings_row: Settings) -> bool:
    if settings_row.subscription_status != "trialing" or settings_row.trial_ends_at is None:
        return False
    return as_aware_utc(settings_row.trial_ends_at) <= utc_now()


def suspend_for_trial_expiry(db: Session, settings_row: Settings) -> None:
    """Idempotent: only actually transitions a still-`trialing` row. Safe to call from both the
    per-request self-heal path and the daily cron without risk of double-writing a suspension or
    double-sending the expiry notification for the same trial — the `subscription_status !=
    "trialing"` guard makes a second call a no-op.
    """
    if settings_row.subscription_status != "trialing":
        return
    now = utc_now()
    from_status = settings_row.subscription_status
    settings_row.subscription_status = "suspended"
    settings_row.suspended_at = now
    settings_row.suspension_reason = SUSPENSION_REASON_TRIAL_EXPIRED
    db.add(settings_row)
    db.add(
        SubscriptionEvent(
            tenant_id=settings_row.tenant_id,
            event_type="suspended",
            from_plan=settings_row.plan,
            to_plan=settings_row.plan,
            from_status=from_status,
            to_status="suspended",
            note="Automatically suspended — 14-day trial period ended",
            changed_by="system (trial expiry)",
        )
    )
    create_notification(
        db,
        tenant_id=settings_row.tenant_id,
        type=TYPE_SUBSCRIPTION_EXPIRY,
        title="Your trial has ended",
        message="Your 14-day trial has ended and your account is now suspended. Subscribe to a plan to continue using BillIQ.",
    )


def is_subscription_blocked(settings_row: Settings) -> bool:
    """Pure check, no DB writes — used both by the self-healing request-time enforcement below
    and anywhere else (e.g. a read-only status endpoint) that needs the answer without mutating
    anything."""
    if settings_row.subscription_status in _BLOCKING_STATUSES:
        return True
    return is_trial_overdue(settings_row)


def enforce_subscription_access(db: Session, settings_row: Settings, request_path: str) -> None:
    """Raises HTTPException(402) if this tenant's subscription state should block the request.

    A 402 (Payment Required) is used rather than 403 so the frontend can distinguish "your
    subscription needs attention" (show the suspension screen) from "you don't have permission"
    (403, e.g. a role check) — they need different UI treatment.
    """
    if any(request_path.startswith(prefix) for prefix in SUBSCRIPTION_ACCESS_EXEMPT_PREFIXES):
        return

    if is_trial_overdue(settings_row):
        # Self-heal right now rather than waiting for the next cron run — this is the specific
        # "gap between expiry and cron execution" the spec calls out. Idempotent, so if the cron
        # (or another concurrent request) already flipped this a moment ago, this is a no-op.
        suspend_for_trial_expiry(db, settings_row)
        db.commit()

    if is_subscription_blocked(settings_row):
        raise HTTPException(
            status_code=402,
            detail={
                "code": "SUBSCRIPTION_REQUIRED",
                "message": "Your trial has ended. Please subscribe to continue using BillIQ.",
                "subscription_status": settings_row.subscription_status,
                "suspension_reason": settings_row.suspension_reason,
            },
        )
