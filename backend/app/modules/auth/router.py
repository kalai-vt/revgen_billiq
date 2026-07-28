from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_role
from app.core.responses import make_response
from app.modules.auth.service import (
    AuthError,
    authenticate,
    change_password,
    create_team_member,
    get_login_history,
    get_tenant,
    issue_tokens,
    list_team_members,
    register_tenant,
    request_password_reset,
    resend_verification,
    reset_password,
    revoke_refresh_token,
    rotate_refresh_token,
    save_avatar,
    update_profile,
    update_tenant_profile,
    verify_email,
)
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginHistoryEntryOut,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TeamMemberCreate,
    TenantOut,
    TenantUpdate,
    UpdateProfileRequest,
    UserOut,
    VerifyEmailRequest,
)
from app.models.settings import Settings
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        tenant, user = register_tenant(db, payload)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return make_response(
        True,
        "Account created. Please check your email to verify your account.",
        {
            "tenant": TenantOut.model_validate(tenant).model_dump(mode="json"),
            "user": UserOut.model_validate(user).model_dump(mode="json"),
        },
    )


@router.post("/verify-email")
def verify_email_route(payload: VerifyEmailRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        verify_email(db, payload.token)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Email verified successfully. You can now sign in.", {})


@router.post("/resend-verification")
def resend_verification_route(payload: ResendVerificationRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        resend_verification(db, payload.email)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Verification email sent. Please check your inbox.", {})


@router.post("/forgot-password")
def forgot_password_route(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    request_password_reset(db, payload.email)
    return make_response(True, "If an account exists for this email, a password reset link has been sent.", {})


@router.post("/reset-password")
def reset_password_route(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        reset_password(db, payload.token, payload.new_password)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Password reset successfully. Please sign in with your new password.", {})


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        user = authenticate(db, payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    access_token, refresh_token = issue_tokens(db, user, remember_me=payload.remember_me)
    # Include tenant/plan/can_override_price directly (same shape as GET /me) so the client
    # doesn't need a second round-trip right after login just to render the shell.
    tenant = get_tenant(db, user.tenant_id)
    settings = db.query(Settings).filter(Settings.tenant_id == user.tenant_id).first()
    return make_response(
        True,
        "Login successful",
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": UserOut.model_validate(user).model_dump(mode="json"),
            "tenant": TenantOut.model_validate(tenant).model_dump(mode="json") if tenant else None,
            "plan": settings.plan if settings else "basic",
            "can_override_price": _can_override_price(user, settings),
        },
    )


@router.post("/refresh")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        _, access_token, refresh_token = rotate_refresh_token(db, payload.refresh_token)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return make_response(True, "Token refreshed", {"access_token": access_token, "refresh_token": refresh_token})


@router.post("/logout")
def logout(payload: LogoutRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    revoke_refresh_token(db, payload.refresh_token)
    return make_response(True, "Logged out", {})


def _can_override_price(current_user: User, settings: Settings | None) -> bool:
    if current_user.role == "owner":
        return True
    if current_user.role == "manager":
        return bool(settings and settings.allow_manager_price_override)
    return False


@router.get("/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    settings = db.query(Settings).filter(Settings.tenant_id == current_user.tenant_id).first()
    return make_response(
        True,
        "Current user loaded",
        {
            "user": UserOut.model_validate(current_user).model_dump(mode="json"),
            "tenant": TenantOut.model_validate(tenant).model_dump(mode="json"),
            "plan": settings.plan if settings else "basic",
            "can_override_price": _can_override_price(current_user, settings),
        },
    )


@router.put("/me")
def put_me(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user = update_profile(db, current_user, payload)
    return make_response(True, "Profile updated", UserOut.model_validate(user).model_dump(mode="json"))


@router.put("/change-password")
def put_change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        access_token, refresh_token = change_password(db, current_user, payload.current_password, payload.new_password)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(
        True,
        "Password changed. Other sessions have been signed out.",
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": UserOut.model_validate(current_user).model_dump(mode="json"),
        },
    )


@router.post("/me/avatar")
async def post_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    content = await file.read()
    try:
        user = save_avatar(db, current_user, content, file.content_type or "")
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Avatar updated", UserOut.model_validate(user).model_dump(mode="json"))


@router.get("/me/login-history")
def get_me_login_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = get_login_history(db, current_user, page=page, page_size=page_size)
    return make_response(
        True,
        "Login history loaded",
        {
            "items": [LoginHistoryEntryOut.model_validate(i, from_attributes=True).model_dump(mode="json") for i in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )


@router.put("/tenant")
def put_tenant(
    payload: TenantUpdate,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    tenant = get_tenant(db, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant = update_tenant_profile(db, tenant, payload)
    return make_response(True, "Organization profile updated", TenantOut.model_validate(tenant).model_dump(mode="json"))


@router.get("/team")
def get_team(
    current_user: User = Depends(require_role("owner", "manager")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    members = list_team_members(db, current_user.tenant_id)
    return make_response(
        True, "Team members loaded", {"items": [UserOut.model_validate(m).model_dump(mode="json") for m in members]}
    )


@router.post("/team")
def post_team(
    payload: TeamMemberCreate,
    current_user: User = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        member = create_team_member(db, current_user.tenant_id, payload)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Team member created", UserOut.model_validate(member).model_dump(mode="json"))
