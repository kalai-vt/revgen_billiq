from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


def _resolve_database_url(url: str) -> str:
    # Neon (and most managed Postgres providers) hand out plain "postgresql://" URLs;
    # our driver is psycopg3 (see requirements.txt), which needs the "+psycopg" dialect.
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


database_url = _resolve_database_url(settings.database_url)
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
# Serverless functions are short-lived processes — pooling connections across invocations
# just leaks stale connections, so hand pooling off to Neon's own pooler instead.
engine_kwargs = {"poolclass": NullPool} if os.environ.get("VERCEL") else {}
engine = create_engine(database_url, connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
