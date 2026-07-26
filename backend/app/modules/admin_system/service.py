from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

_PROCESS_STARTED_AT = time.monotonic()
_PROCESS_STARTED_AT_WALL = datetime.now(timezone.utc)


def _check_db(db: Session) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        db.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return {"ok": True, "latency_ms": latency_ms}
    except Exception as exc:  # noqa: BLE001 — surfaced to the admin, not swallowed
        return {"ok": False, "latency_ms": None, "error": str(exc)}


def get_system_health(db: Session, admin_db: Session) -> dict[str, Any]:
    billing = _check_db(db)
    admin = _check_db(admin_db)
    return {
        "billing_db": billing,
        "admin_db": admin,
        "api_ok": True,
        "uptime_seconds": round(time.monotonic() - _PROCESS_STARTED_AT, 1),
        "process_started_at": _PROCESS_STARTED_AT_WALL,
        "checked_at": datetime.now(timezone.utc),
    }
