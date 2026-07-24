from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.core.timeutils import as_aware_utc
from app.models.user import User


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = auth_header.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.get(User, payload["sub"])
    if not user or user.status != "active":
        raise HTTPException(status_code=401, detail="User not found")

    if user.session_invalidated_at is not None and payload.get("iat") is not None:
        issued_at = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        # JWT `iat` is truncated to whole seconds, while session_invalidated_at keeps
        # microsecond precision — flooring it to the second before comparing avoids spuriously
        # rejecting a token minted in the same wall-clock second as the invalidation (which
        # matters here since change-password sets session_invalidated_at and mints a fresh
        # token moments apart, often within the same second).
        invalidated_at = as_aware_utc(user.session_invalidated_at).replace(microsecond=0)
        if issued_at < invalidated_at:
            raise HTTPException(status_code=401, detail="Session expired, please log in again")

    return user


def require_role(*roles: str) -> Callable[..., User]:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(roles)}")
        return current_user

    return dependency
