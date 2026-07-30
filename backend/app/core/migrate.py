from __future__ import annotations

import logging
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
