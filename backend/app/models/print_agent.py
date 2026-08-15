from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PairingCode(Base):
    """A short-lived, 6-digit numeric code a tenant user generates in the browser and types into
    the local RevGenAI Print Agent to pair it — see app/modules/printing/router.py's
    ``/agent/pairing-code`` and ``/agent/pair`` endpoints. Only one unconsumed code exists per
    tenant at a time; generating a new one invalidates any prior one."""

    __tablename__ = "pairing_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    code: Mapped[str] = mapped_column(String(10), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PrintAgentDevice(Base):
    """A local RevGenAI Print Agent process that has completed pairing for a tenant. Only
    ``secret_hash`` (a SHA-256 hex digest) is stored — the raw device secret is returned once, at
    pairing time, and never persisted or logged."""

    __tablename__ = "print_agent_devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    platform: Mapped[str] = mapped_column(String(20))
    agent_version: Mapped[str] = mapped_column(String(50))
    device_fingerprint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    secret_hash: Mapped[str] = mapped_column(String(64))
    paired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PrintJob(Base):
    """A print job dispatched to a paired Print Agent device over its local WebSocket connection.
    Written by the (separately built) WebSocket server as jobs are queued/progress/complete; not
    written by any endpoint in this module yet."""

    __tablename__ = "print_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("print_agent_devices.id"), index=True)
    printer_id: Mapped[str] = mapped_column(String(255))
    document_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="queued")
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
