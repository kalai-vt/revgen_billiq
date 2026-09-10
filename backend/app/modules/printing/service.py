from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutils import as_aware_utc
from app.models.print_agent import PairingCode, PrintAgentDevice
from datetime import datetime, timezone

from app.models.printer_config import DEFAULT_TICKET_FIELDS, PrinterConfiguration
from app.schemas.printer_config import PrinterConfigurationUpdate


# Must match the frontend's qz.security.setSignatureAlgorithm('SHA512') call in
# lib/printing/qzTraySigning.ts — QZ Tray verifies the signature using whichever algorithm the
# frontend told it to expect, independent of what the backend actually signs with, so the two
# have to agree.
_HASH_ALGORITHM = hashes.SHA512()


class QzSigningError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


def is_configured() -> bool:
    return bool(settings.qz_tray_private_key and settings.qz_tray_certificate)


def get_certificate() -> str:
    return settings.qz_tray_certificate


_private_key: RSAPrivateKey | None = None


def _get_private_key() -> RSAPrivateKey:
    global _private_key
    if _private_key is None:
        try:
            key = serialization.load_pem_private_key(settings.qz_tray_private_key.encode(), password=None)
        except ValueError as exc:
            raise QzSigningError("REVGENIQ_QZ_TRAY_PRIVATE_KEY is not a valid PEM private key.") from exc
        if not isinstance(key, RSAPrivateKey):
            raise QzSigningError("REVGENIQ_QZ_TRAY_PRIVATE_KEY must be an RSA private key.")
        _private_key = key
    return _private_key


def sign(to_sign: str) -> str:
    if not is_configured():
        raise QzSigningError("QZ Tray signing isn't configured for this deployment.")
    signature = _get_private_key().sign(to_sign.encode(), padding.PKCS1v15(), _HASH_ALGORITHM)
    return base64.b64encode(signature).decode()


# --- RevGenAI Print Agent: pairing, devices, and session-token signing -----------------------
#
# This is a second, distinct feature bolted onto the same `printing` module/router (not a
# replacement for the QZ Tray signing above): a self-hosted local "Print Agent" process replaces
# QZ Tray, and needs (1) a device-pairing flow so the browser can hand it a long-lived device
# secret once, and (2) a signed, short-lived session token the browser can hand it on every print
# so the agent can verify, entirely offline, which tenant/user is asking — without a network
# round-trip to this backend per print. The WebSocket server the agent actually speaks to is a
# separate Node.js process built elsewhere; everything here is just the HTTP contract it depends
# on.

PAIRING_CODE_EXPIRY_MINUTES = 5
SESSION_TOKEN_EXPIRY_SECONDS = 60


class PrintAgentError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _generate_pairing_code_value() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def create_pairing_code(db: Session, tenant_id: str, user_id: str) -> PairingCode:
    """Generates a fresh 6-digit pairing code for the tenant, first deleting any prior unconsumed
    code for that tenant so only one is ever active at a time."""
    db.query(PairingCode).filter(PairingCode.tenant_id == tenant_id, PairingCode.consumed_at.is_(None)).delete()

    pairing_code = PairingCode(
        tenant_id=tenant_id,
        code=_generate_pairing_code_value(),
        expires_at=_now() + timedelta(minutes=PAIRING_CODE_EXPIRY_MINUTES),
        created_by_user_id=user_id,
    )
    db.add(pairing_code)
    db.commit()
    db.refresh(pairing_code)
    return pairing_code


def _hash_device_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def pair_device(
    db: Session, code: str, platform: str, agent_version: str, device_fingerprint: str | None
) -> tuple[PrintAgentDevice, str]:
    """Consumes a pairing code and creates a new paired device. Returns (device, raw_secret) —
    `raw_secret` is generated here and returned to the caller only this once; only its SHA-256
    hash is ever persisted, so it cannot be recovered again after this call returns."""
    pairing_code = db.query(PairingCode).filter(PairingCode.code == code).first()
    if pairing_code is None:
        raise PrintAgentError(400, "Invalid pairing code.")
    if pairing_code.consumed_at is not None:
        raise PrintAgentError(400, "This pairing code has already been used.")
    if as_aware_utc(pairing_code.expires_at) < _now():
        raise PrintAgentError(400, "This pairing code has expired.")

    pairing_code.consumed_at = _now()

    raw_secret = secrets.token_urlsafe(32)
    device = PrintAgentDevice(
        tenant_id=pairing_code.tenant_id,
        platform=platform,
        agent_version=agent_version,
        device_fingerprint=device_fingerprint,
        secret_hash=_hash_device_secret(raw_secret),
        paired_at=_now(),
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device, raw_secret


def get_device_for_tenant(db: Session, device_id: str, tenant_id: str) -> PrintAgentDevice:
    """Looks up a device by id, distinguishing "doesn't exist" (404) from "exists but belongs to
    a different tenant" (403) — the latter is the tenant-isolation boundary and is asserted on
    explicitly by tests."""
    device = db.get(PrintAgentDevice, device_id)
    if device is None:
        raise PrintAgentError(404, "Device not found.")
    if device.tenant_id != tenant_id:
        raise PrintAgentError(403, "Device belongs to a different tenant.")
    return device


def get_active_device_for_tenant(db: Session, device_id: str, tenant_id: str) -> PrintAgentDevice:
    """Same as `get_device_for_tenant`, plus rejecting an already-revoked device — used by the
    session-token endpoint, which should never mint a token for a revoked device. (`revoke`
    itself uses the plain `get_device_for_tenant` above, since revoking an already-revoked
    device must stay a no-op, not a 403.)"""
    device = get_device_for_tenant(db, device_id, tenant_id)
    if device.revoked_at is not None:
        raise PrintAgentError(403, "This device has been revoked.")
    return device


def touch_device_last_seen(db: Session, device: PrintAgentDevice) -> None:
    device.last_seen = _now()
    db.commit()


def list_devices(db: Session, tenant_id: str) -> list[PrintAgentDevice]:
    return (
        db.query(PrintAgentDevice)
        .filter(PrintAgentDevice.tenant_id == tenant_id, PrintAgentDevice.revoked_at.is_(None))
        .order_by(PrintAgentDevice.paired_at.desc())
        .all()
    )


def revoke_device(db: Session, device_id: str, tenant_id: str) -> PrintAgentDevice:
    device = get_device_for_tenant(db, device_id, tenant_id)
    if device.revoked_at is None:
        device.revoked_at = _now()
        db.commit()
        db.refresh(device)
    return device


def build_session_token_payload(device_id: str, tenant_id: str, user_id: str) -> dict:
    issued_at = _now()
    expires_at = issued_at + timedelta(seconds=SESSION_TOKEN_EXPIRY_SECONDS)
    # Unix timestamps (whole seconds), not ISO strings, so the agent-side verifier can compare
    # directly against `Date.now() / 1000` with no date-parsing involved.
    return {
        "device_id": device_id,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "issued_at": int(issued_at.timestamp()),
        "expires_at": int(expires_at.timestamp()),
    }


def is_token_signing_configured() -> bool:
    return bool(settings.print_agent_signing_private_key and settings.print_agent_signing_public_key)


def get_token_public_key() -> str:
    return settings.print_agent_signing_public_key


_token_private_key: RSAPrivateKey | None = None


def _get_token_private_key() -> RSAPrivateKey:
    global _token_private_key
    if _token_private_key is None:
        try:
            key = serialization.load_pem_private_key(settings.print_agent_signing_private_key.encode(), password=None)
        except ValueError as exc:
            raise PrintAgentError(500, "REVGENIQ_PRINT_AGENT_SIGNING_PRIVATE_KEY is not a valid PEM private key.") from exc
        if not isinstance(key, RSAPrivateKey):
            raise PrintAgentError(500, "REVGENIQ_PRINT_AGENT_SIGNING_PRIVATE_KEY must be an RSA private key.")
        _token_private_key = key
    return _token_private_key


def sign_session_token(payload: dict) -> tuple[str, str]:
    """Returns (token, signature), both base64-encoded: `token` decodes to the JSON payload
    bytes, `signature` is the RSA (SHA512/PKCS1v15 — same technique as QZ Tray signing above)
    signature over those same raw JSON bytes."""
    if not is_token_signing_configured():
        raise PrintAgentError(400, "Print Agent session-token signing isn't configured for this deployment.")
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = _get_token_private_key().sign(payload_bytes, padding.PKCS1v15(), _HASH_ALGORITHM)
    return base64.b64encode(payload_bytes).decode(), base64.b64encode(signature).decode()


# ---- Printer destinations (kitchen today, bar/tandoor later) ---------------------------------

def get_printer_config(db: Session, tenant_id: str, role: str = "kot") -> PrinterConfiguration:
    """Returns the tenant's configuration for a role, creating an empty one on first read.

    Created rather than returning None so the settings screen always has a row to edit and the
    caller never has to distinguish "never configured" from "configured and disabled" — `enabled`
    already says that, and it defaults to off.
    """
    config = (
        db.query(PrinterConfiguration)
        .filter(PrinterConfiguration.tenant_id == tenant_id, PrinterConfiguration.role == role)
        .first()
    )
    if config:
        return config

    config = PrinterConfiguration(tenant_id=tenant_id, role=role, ticket_fields=dict(DEFAULT_TICKET_FIELDS))
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def update_printer_config(
    db: Session, tenant_id: str, role: str, payload: PrinterConfigurationUpdate
) -> PrinterConfiguration:
    config = get_printer_config(db, tenant_id, role)
    data = payload.model_dump(exclude_unset=True)

    if "ticket_fields" in data and data["ticket_fields"] is not None:
        config.ticket_fields = dict(data.pop("ticket_fields"))
    else:
        data.pop("ticket_fields", None)

    # Anything that changes *where* or *how* we reach the printer invalidates the last successful
    # test — claiming "Connected" against a device we have not reached since the address changed
    # is exactly the lie this feature must not tell.
    reachability_keys = {"connection_type", "ip_address", "port", "usb_device_id", "bluetooth_device_id", "printer_name"}
    if any(key in data and data[key] != getattr(config, key) for key in reachability_keys):
        config.connection_status = "untested"
        config.last_tested_at = None
        config.last_test_error = None

    for key, value in data.items():
        setattr(config, key, value)

    if not _is_addressable(config):
        config.connection_status = "unconfigured"

    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def _is_addressable(config: PrinterConfiguration) -> bool:
    """Whether there is enough configuration to even attempt a print."""
    if config.connection_type in ("lan", "wifi"):
        return bool(config.ip_address and config.port)
    if config.connection_type == "bluetooth":
        return bool(config.bluetooth_device_id or config.printer_name)
    return bool(config.printer_name or config.usb_device_id)


def record_connection_test(
    db: Session, tenant_id: str, role: str, ok: bool, error: str | None
) -> PrinterConfiguration:
    """Records the outcome of a test the client actually performed.

    The server never decides this on its own: the browser holds the USB/Bluetooth connection, so
    only it can know whether the printer answered. Saving a form must never produce "Connected".
    """
    config = get_printer_config(db, tenant_id, role)
    config.connection_status = "connected" if ok else "failed"
    config.last_tested_at = datetime.now(timezone.utc)
    config.last_test_error = None if ok else (error or "The printer did not respond.")
    db.add(config)
    db.commit()
    db.refresh(config)
    return config
