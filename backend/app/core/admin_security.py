from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import settings

# Password hashing (hash_password/verify_password/needs_rehash) and refresh-token generation
# (generate_refresh_token/hash_refresh_token) are algorithm-generic — reused as-is from
# app.core.security rather than duplicated. Only token *issuance* differs (separate secret,
# separate "type" claim, no tenant_id), which is what lives here.

ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES = 30
ADMIN_REFRESH_TOKEN_EXPIRE_DAYS = 7


def create_admin_access_token(admin_user_id: str, role: str) -> str:
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": admin_user_id,
        "role": role,
        "type": "admin_access",
        "iat": issued_at,
        "exp": expires_at,
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.admin_jwt_secret, algorithm=settings.jwt_algorithm)


def decode_admin_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.admin_jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("type") != "admin_access":
        return None
    return payload


def admin_refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=ADMIN_REFRESH_TOKEN_EXPIRE_DAYS)
