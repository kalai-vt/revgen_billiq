from __future__ import annotations

import hmac
import os
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.responses import make_response
from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser

router = APIRouter(prefix="/api/internal/agent-bootstrap", tags=["internal-bootstrap"])

# TEMPORARY. Exists only for one-off production access requested directly by the account owner
# (2026-08-09, investigating/fixing the "98 Cafe" plan/module-flags mismatch) — the normal
# bootstrap_admin.py script needs a shell on the deployed instance, which doesn't exist on
# Vercel, and the production DB connection string is intentionally unretrievable via the Vercel
# API (see app/core/migrate.py's health diagnostic from the same investigation for why that
# matters). Mirrors internal_cron/router.py's own secret-header pattern. Remove this whole
# module, its router registration in app/main.py, and the INTERNAL_BOOTSTRAP_SECRET env var once
# the investigation is done — do not leave a standing admin-account-creation endpoint in
# production.
def _verify_secret(request: Request) -> None:
    secret = os.environ.get("INTERNAL_BOOTSTRAP_SECRET")
    auth_header = request.headers.get("authorization") or ""
    presented = auth_header.removeprefix("Bearer ").strip()
    if not secret or not presented or not hmac.compare_digest(presented, secret):
        raise HTTPException(status_code=401, detail="Invalid or missing bootstrap secret")


class BootstrapRequest(BaseModel):
    action: Literal["create", "deactivate"]
    email: str
    password: str | None = None
    first_name: str = "Agent"
    last_name: str = "Temp"


@router.post("")
def bootstrap(
    payload: BootstrapRequest,
    _: None = Depends(_verify_secret),
    admin_db: Session = Depends(get_admin_db),
) -> dict[str, Any]:
    if payload.action == "create":
        if admin_db.query(AdminUser).filter(AdminUser.email == payload.email).first():
            raise HTTPException(status_code=400, detail="An admin with this email already exists")
        if not payload.password or len(payload.password) < 10:
            raise HTTPException(status_code=400, detail="Password must be at least 10 characters")
        admin = AdminUser(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            password_hash=hash_password(payload.password),
            role="super_admin",
            status="active",
        )
        admin_db.add(admin)
        admin_db.commit()
        return make_response(True, "Temporary admin created", {"id": admin.id, "email": admin.email})

    # deactivate, not delete: this admin may already have AdminAuditLog rows referencing its id
    # (e.g. from actions taken during the investigation) — hard-deleting the row breaks that FK
    # and the audit trail is exactly what should survive. is_active=False + status="suspended"
    # is the same effect admin_staff.service.set_active_status() uses, and login already checks it.
    admin = admin_db.query(AdminUser).filter(AdminUser.email == payload.email).first()
    if not admin:
        raise HTTPException(status_code=404, detail="No admin with this email")
    admin.is_active = False
    admin.status = "suspended"
    admin_db.add(admin)
    admin_db.commit()
    return make_response(True, "Temporary admin deactivated", None)
