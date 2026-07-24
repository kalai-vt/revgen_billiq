from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# argon2 is the current OWASP-recommended default for new hashes; pbkdf2_sha256 stays listed
# (deprecated) so existing hashes from before this change still verify — they get transparently
# re-hashed to argon2 on next successful login via needs_rehash()/hash_password().
pwd_context = CryptContext(schemes=["argon2", "pbkdf2_sha256"], deprecated=["pbkdf2_sha256"])


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def needs_rehash(password_hash: str) -> bool:
    return pwd_context.needs_update(password_hash)


def create_access_token(user_id: str, tenant_id: str) -> str:
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "type": "access",
        "iat": issued_at,
        "exp": expires_at,
        # jti guarantees uniqueness even when two tokens for the same user are minted within
        # the same whole second (iat's granularity) — otherwise they'd be byte-identical JWTs,
        # which breaks any "the old one is now invalid" guarantee (e.g. change-password
        # revoking prior sessions while immediately issuing a fresh one).
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_token_expiry(remember_me: bool = False) -> datetime:
    days = settings.remember_me_refresh_token_expire_days if remember_me else settings.refresh_token_expire_days
    return datetime.now(timezone.utc) + timedelta(days=days)
