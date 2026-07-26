from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db import _resolve_database_url

# A genuinely separate Postgres database from the tenant-facing Billing app's — isolates
# RevGenIQ employee credentials and the admin audit trail from customer data. Postgres can't
# enforce foreign keys across two databases, so this connection only ever holds tables with no
# natural FK relationship to tenant data (admin_users, admin_audit_log, admin_refresh_tokens).
# Anything that needs a real FK to `tenants`/`invoices` (tenant status, feature flags) lives in
# the main billing database instead — see app/core/db.py.
admin_database_url = _resolve_database_url(settings.admin_database_url)
admin_connect_args = {"check_same_thread": False} if admin_database_url.startswith("sqlite") else {}
admin_engine_kwargs = {"poolclass": NullPool} if os.environ.get("VERCEL") else {}
admin_engine = create_engine(admin_database_url, connect_args=admin_connect_args, **admin_engine_kwargs)
AdminSessionLocal = sessionmaker(bind=admin_engine, autoflush=False, autocommit=False)


class AdminBase(DeclarativeBase):
    pass


def get_admin_db() -> Generator[Session, None, None]:
    db = AdminSessionLocal()
    try:
        yield db
    finally:
        db.close()
