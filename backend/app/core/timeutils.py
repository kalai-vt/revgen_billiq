from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_aware_utc(value: datetime) -> datetime:
    """SQLite drops tzinfo on round-trip; treat naive datetimes as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def days_remaining(target: datetime | None) -> int | None:
    """Whole days left until `target` (e.g. a trial's trial_ends_at), floored at 0 once it's
    passed. None in, None out — "no trial" and "trial already over" are different states callers
    need to tell apart."""
    if target is None:
        return None
    delta = as_aware_utc(target) - utc_now()
    return max(delta.days, 0) if delta.total_seconds() > 0 else 0
