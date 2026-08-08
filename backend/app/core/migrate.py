from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parent.parent.parent
_ALEMBIC_INI = _ROOT / "alembic.ini"
_ALEMBIC_ADMIN_INI = _ROOT / "alembic_admin.ini"


def apply_pending_migrations() -> None:
    """Runs `alembic upgrade head` against the tenant database on process start.

    Vercel's deploy pipeline has no separate migration step, so without this, a deploy that
    changes the schema leaves the live (Neon) database out of sync with the code until someone
    manually runs the migration — every request touching the changed table 500s until then (this
    is exactly what happened to login after the auto-print columns were added: the code expected
    columns the deployed database didn't have yet). Failures are logged rather than raised so a
    migration hiccup doesn't take the whole app down — endpoints unrelated to the affected
    table(s) keep working while it's investigated.
    """
    try:
        command.upgrade(Config(str(_ALEMBIC_INI)), "head")
    except Exception:
        logger.exception("Failed to apply pending database migrations on startup")


def apply_pending_admin_migrations() -> None:
    """Same as `apply_pending_migrations()`, but for the separate RevGenIQ Admin Portal database
    (see app/core/admin_db.py). This chain (alembic_admin.ini / alembic_admin/) didn't exist until
    now — every prior change to app/models_admin/* had no automated way to reach a deployed
    database at all, not even the "someone runs it by hand eventually" fallback the tenant side
    had before apply_pending_migrations() existed. The baseline revision
    (98d0de5b3882_baseline_current_admin_schema) reflects the schema as it already exists in any
    environment that predates this file; that database must be `alembic -c alembic_admin.ini stamp
    head` *once* (not upgraded — the tables already exist) before this runs there, or every real
    future admin-side migration will try to re-create tables that are already present and fail.
    """
    try:
        command.upgrade(Config(str(_ALEMBIC_ADMIN_INI)), "head")
    except Exception:
        logger.exception("Failed to apply pending admin database migrations on startup")


def apply_all_pending_migrations() -> None:
    """Runs both migration checks concurrently instead of back-to-back.

    Every cold start (Vercel serverless, or local `uvicorn --reload`) pays for two separate
    Postgres connections here before the process can serve its first request — each one is also
    the request most likely to hit Neon's own connection-wake latency after the compute has
    auto-suspended from inactivity. The two databases are entirely independent (different
    alembic.ini, different connection, no shared state beyond Python's own logging, which is
    thread-safe), so there's no reason to pay that cost twice sequentially — running them on two
    threads overlaps the network-bound wait instead of adding it.
    """
    with ThreadPoolExecutor(max_workers=2) as pool:
        tenant_future = pool.submit(apply_pending_migrations)
        admin_future = pool.submit(apply_pending_admin_migrations)
        tenant_future.result()
        admin_future.result()
