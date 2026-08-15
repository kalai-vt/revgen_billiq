from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class QzCertificateOut(BaseModel):
    certificate: str


class QzSignRequest(BaseModel):
    to_sign: str


class QzSignOut(BaseModel):
    signature: str


# --- RevGenAI Print Agent: pairing + session tokens (app/modules/printing, extended) ---


class PairingCodeOut(BaseModel):
    code: str
    expires_at: datetime


class PairRequest(BaseModel):
    pairing_code: str
    platform: str
    agent_version: str
    device_fingerprint: str | None = None


class PairOut(BaseModel):
    """Returned exactly once, at pairing time — `device_secret` is never stored (only its SHA-256
    hash is) and can never be recovered again after this response."""

    device_id: str
    device_secret: str


class SessionTokenRequest(BaseModel):
    device_id: str


class SessionTokenOut(BaseModel):
    # `token` is the base64-encoded JSON payload {device_id, tenant_id, user_id, issued_at,
    # expires_at}; `signature` is the base64-encoded RSA (SHA512/PKCS1v15) signature over the
    # raw (pre-base64) JSON payload bytes. Deliberately two plain fields rather than a JWT, so
    # the Print Agent's verifier has an unambiguous, minimal contract to implement.
    token: str
    signature: str


class TokenPublicKeyOut(BaseModel):
    public_key: str


class PrintAgentDeviceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str | None
    platform: str
    agent_version: str
    paired_at: datetime
    last_seen: datetime | None
