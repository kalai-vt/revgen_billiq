from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parent.parent.parent
_ALEMBIC_INI = _ROOT / "alembic.ini"
_ALEMBIC_ADMIN_INI = _ROOT / "alembic_admin.ini"

# TEMPORARY diagnostic surface: this app has no log aggregation/Sentry configured, so a silently
# swallowed migration failure (see the try/except below) is otherwise invisible from outside the
# Vercel dashboard. Exposed read-only via GET /api/health's `migrations` field. Remove once the
# 2026-08-09 production incident (registration/login 500ing after a deploy) is root-caused.
last_migration_error: str | None = None
last_admin_migration_error: str | None = None


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
    global last_migration_error
    try:
        command.upgrade(Config(str(_ALEMBIC_INI)), "head")
        last_migration_error = None
    except Exception as exc:
        last_migration_error = f"{type(exc).__name__}: {exc}"
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
    global last_admin_migration_error
    try:
        command.upgrade(Config(str(_ALEMBIC_ADMIN_INI)), "head")
        last_admin_migration_error = None
    except Exception as exc:
        last_admin_migration_error = f"{type(exc).__name__}: {exc}"
        logger.exception("Failed to apply pending admin database migrations on startup")


def apply_all_pending_migrations() -> None:
    """Runs both migration checks back-to-back, in the same thread.

    A prior version of this ran the two `command.upgrade()` calls concurrently in a
    `ThreadPoolExecutor` to overlap their network-bound waits on cold start. That's unsafe:
    Alembic's `context`/`op` objects (imported as `from alembic import context` in both
    alembic/env.py and alembic_admin/env.py) are process-global proxies, not per-call isolated —
    `EnvironmentContext.configure()` from one thread clobbers the "current" context the other
    thread is mid-way through using. This caused a real production incident (2026-08-09):
    the admin migration failed with a literal `KeyError: 'config'` (its context got overwritten
    mid-setup) while the tenant migration's transaction aborted partway through
    (`current transaction is aborted, commands ignored until end of transaction block`) — both
    symptoms of the two threads interleaving inside Alembic's shared state. Sequential execution
    costs a bit more cold-start latency but is correct.
    """
    apply_pending_migrations()
    apply_pending_admin_migrations()
