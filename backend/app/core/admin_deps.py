from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_security import decode_admin_access_token
from app.core.timeutils import as_aware_utc
from app.models_admin.admin_user import AdminUser


def get_current_admin_user(request: Request, db: Session = Depends(get_admin_db)) -> AdminUser:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = auth_header.split(" ", 1)[1]
    payload = decode_admin_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    admin = db.get(AdminUser, payload["sub"])
    if not admin or admin.status != "active":
        raise HTTPException(status_code=401, detail="Admin user not found")

    if admin.session_invalidated_at is not None and payload.get("iat") is not None:
        from datetime import datetime, timezone

        issued_at = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        invalidated_at = as_aware_utc(admin.session_invalidated_at).replace(microsecond=0)
        if issued_at < invalidated_at:
            raise HTTPException(status_code=401, detail="Session expired, please log in again")

    return admin


def require_admin_role(*roles: str) -> Callable[..., AdminUser]:
    def dependency(current_admin: AdminUser = Depends(get_current_admin_user)) -> AdminUser:
        if roles and current_admin.role not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(roles)}")
        return current_admin

    return dependency
