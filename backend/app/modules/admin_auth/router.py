from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.modules.admin_auth import service
from app.modules.admin_auth.service import AdminAuthError
from app.modules.admin_staff.service import AdminStaffError, accept_invite, change_own_password
from app.schemas.admin_auth import (
    AdminAuthResult,
    AdminLoginRequest,
    AdminLogoutRequest,
    AdminRefreshRequest,
    AdminUserOut,
)
from app.schemas.admin_staff import AcceptInviteRequest, ChangeOwnPasswordRequest

router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])


@router.post("/login")
def post_admin_login(payload: AdminLoginRequest, db: Session = Depends(get_admin_db)) -> dict[str, Any]:
    try:
        admin = service.authenticate_admin(db, payload.email, payload.password)
    except AdminAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    access_token, refresh_token = service.issue_admin_tokens(db, admin)
    result = AdminAuthResult(
        access_token=access_token,
        refresh_token=refresh_token,
        admin_user=AdminUserOut.model_validate(admin),
    )
    return make_response(True, "Login successful", result.model_dump(mode="json"))


@router.post("/refresh")
def post_admin_refresh(payload: AdminRefreshRequest, db: Session = Depends(get_admin_db)) -> dict[str, Any]:
    try:
        admin, access_token, refresh_token = service.rotate_admin_refresh_token(db, payload.refresh_token)
    except AdminAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    result = AdminAuthResult(
        access_token=access_token,
        refresh_token=refresh_token,
        admin_user=AdminUserOut.model_validate(admin),
    )
    return make_response(True, "Token refreshed", result.model_dump(mode="json"))


@router.post("/logout")
def post_admin_logout(payload: AdminLogoutRequest, db: Session = Depends(get_admin_db)) -> dict[str, Any]:
    service.revoke_admin_refresh_token(db, payload.refresh_token)
    return make_response(True, "Logged out")


@router.get("/me")
def get_admin_me(current_admin: AdminUser = Depends(get_current_admin_user)) -> dict[str, Any]:
    return make_response(True, "Current admin loaded", AdminUserOut.model_validate(current_admin).model_dump(mode="json"))


@router.post("/accept-invite")
def post_accept_invite(payload: AcceptInviteRequest, db: Session = Depends(get_admin_db)) -> dict[str, Any]:
    try:
        accept_invite(db, payload.token, payload.password)
    except AdminStaffError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Password set successfully — you can now sign in")


@router.post("/change-password")
def post_change_password(
    payload: ChangeOwnPasswordRequest,
    db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    try:
        change_own_password(db, current_admin, payload.current_password, payload.new_password)
    except AdminStaffError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Password changed successfully")
