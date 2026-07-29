from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)

_ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / "alembic.ini"


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
