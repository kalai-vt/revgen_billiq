from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models.tenant import Tenant

# The single source of truth for "what day is it for this tenant" — every module used to
# compute this independently (naive `date.today()` in some, UTC-only in others), which meant
# "today"/"overdue"/"due today" could disagree between screens depending purely on which
# helper happened to be called. See app/modules/analytics/service.py's original
# _tenant_zone/_local_day_bounds_utc/_tenant_today, now sourced from here instead.


def tenant_zone(tenant: Tenant | None) -> ZoneInfo:
    try:
        return ZoneInfo(tenant.timezone) if tenant else ZoneInfo("UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def local_day_bounds_utc(tenant: Tenant | None, d: date) -> datetime:
    tz = tenant_zone(tenant)
    local_midnight = datetime(d.year, d.month, d.day, tzinfo=tz)
    return local_midnight.astimezone(timezone.utc)


def tenant_today(tenant: Tenant | None) -> date:
    return datetime.now(timezone.utc).astimezone(tenant_zone(tenant)).date()


def tenant_today_by_id(db: Session, tenant_id: str) -> date:
    """Convenience wrapper for callers that only have a tenant_id, not a loaded Tenant
    object — a single indexed primary-key lookup, cheap enough for list/detail endpoints."""
    return tenant_today(db.get(Tenant, tenant_id))
