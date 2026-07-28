from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import (
    EMAIL_VERIFIED,
    EXPIRED_PASSWORD_RESET_TOKEN,
    EXPIRED_VERIFICATION_TOKEN,
    FAILED_LOGIN,
    LOGIN_SUCCESS,
    LOGOUT,
    PASSWORD_CHANGED,
    PASSWORD_RESET_REQUESTED,
    USER_REGISTERED,
    VERIFICATION_EMAIL_RESENT,
    VERIFICATION_EMAIL_SENT,
    count_recent_events,
    log_event,
)
from app.core.blob import upload_file
from app.core.config import settings
from app.core.email.protocol import EmailSendError
from app.core.email.service import send_password_reset_email, send_verification_email
from app.core.limits import assert_feature, assert_under_limit
from app.core.timeutils import as_aware_utc, utc_now
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    needs_rehash,
    refresh_token_expiry,
    verify_password,
)
from app.models.auth_audit import AuthAuditLog
from app.models.tenant import Tenant
from app.models.token import RefreshToken
from app.models.user import User
from app.models.verification import EmailVerificationToken, PasswordResetToken
from app.modules.settings.service import create_default_settings
from app.schemas.auth import RegisterRequest, TeamMemberCreate, TenantUpdate, UpdateProfileRequest

MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
RESEND_VERIFICATION_MAX_PER_HOUR = 3
ALLOWED_AVATAR_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
PASSWORD_RESET_MAX_PER_HOUR = 5

logger = logging.getLogger(__name__)


class AuthError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_user_by_mobile(db: Session, mobile: str) -> User | None:
    return db.query(User).filter(User.mobile == mobile).first()


def get_tenant_by_phone(db: Session, phone: str) -> Tenant | None:
    return db.query(Tenant).filter(Tenant.phone == phone, Tenant.is_deleted.is_(False)).first()


def _issue_and_send_verification(db: Session, user: User, *, resent: bool = False) -> None:
    now = utc_now()
    db.query(EmailVerificationToken).filter(
        EmailVerificationToken.user_id == user.id, EmailVerificationToken.used_at.is_(None)
    ).update({"used_at": now})

    plaintext = generate_refresh_token()
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_refresh_token(plaintext),
            expires_at=now + timedelta(hours=settings.verification_token_expiry_hours),
        )
    )
    log_event(
        db,
        event_type=VERIFICATION_EMAIL_RESENT if resent else VERIFICATION_EMAIL_SENT,
        email=user.email,
        user_id=user.id,
        tenant_id=user.tenant_id,
    )
    db.commit()
    try:
        send_verification_email(to=user.email, first_name=user.first_name, token=plaintext)
    except EmailSendError:
        logger.exception("Failed to send verification email to %s", user.email)
        raise AuthError(
            502,
            "Your account was created, but we couldn't send the verification email right now. "
            "Please use 'Resend verification email' in a moment.",
        ) from None


def register_tenant(db: Session, payload: RegisterRequest) -> tuple[Tenant, User]:
    if get_user_by_email(db, payload.email):
        raise AuthError(400, "Email already registered")
    if get_tenant_by_phone(db, payload.phone) or get_user_by_mobile(db, payload.phone):
        raise AuthError(400, "This mobile number is already registered to another account")

    tenant = Tenant(
        company_name=payload.company_name,
        legal_name=payload.legal_name,
        email=payload.email,
        phone=payload.phone,
        phone_type=payload.phone_type,
        country=payload.country,
        timezone=payload.timezone,
    )
    db.add(tenant)
    db.flush()

    create_default_settings(db, tenant.id, currency=payload.currency)

    user = User(
        tenant_id=tenant.id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        mobile=payload.phone,
        password_hash=hash_password(payload.password),
        role="owner",
        status="pending_verification",
        is_email_verified=False,
    )
    db.add(user)
    db.flush()
    log_event(db, event_type=USER_REGISTERED, email=user.email, user_id=user.id, tenant_id=tenant.id)
    try:
        db.commit()
    except IntegrityError:
        # Defense-in-depth against a race between the pre-checks above and this commit —
        # the pre-checks catch the overwhelming majority of cases already.
        db.rollback()
        raise AuthError(400, "This email or mobile number is already registered.") from None
    db.refresh(tenant)
    db.refresh(user)

    _issue_and_send_verification(db, user)
    return tenant, user


def verify_email(db: Session, token: str) -> User:
    token_hash = hash_refresh_token(token)
    record = db.query(EmailVerificationToken).filter(EmailVerificationToken.token_hash == token_hash).first()
    if not record or record.used_at is not None:
        raise AuthError(400, "This verification link is invalid or has already been used.")

    if as_aware_utc(record.expires_at) < utc_now():
        user = db.get(User, record.user_id)
        log_event(db, event_type=EXPIRED_VERIFICATION_TOKEN, email=user.email if user else "", user_id=record.user_id)
        db.commit()
        raise AuthError(400, "This verification link has expired. Request a new one.")

    user = db.get(User, record.user_id)
    if not user:
        raise AuthError(400, "This verification link is invalid.")

    record.used_at = utc_now()
    user.is_email_verified = True
    user.email_verified_at = utc_now()
    if user.status == "pending_verification":
        user.status = "active"
    db.add(record)
    db.add(user)
    log_event(db, event_type=EMAIL_VERIFIED, email=user.email, user_id=user.id, tenant_id=user.tenant_id)
    db.commit()
    return user


def resend_verification(db: Session, email: str) -> None:
    user = get_user_by_email(db, email)
    if not user:
        raise AuthError(404, "No account found for this email address.")
    if user.status != "pending_verification":
        raise AuthError(400, "This account is already verified.")
    if (
        count_recent_events(db, email=email, event_type=VERIFICATION_EMAIL_RESENT, within=timedelta(hours=1))
        >= RESEND_VERIFICATION_MAX_PER_HOUR
    ):
        raise AuthError(429, "Too many resend requests. Please try again later.")
    _issue_and_send_verification(db, user, resent=True)


def request_password_reset(db: Session, email: str) -> None:
    """Never raises — the caller always returns the same generic response regardless of
    whether the email exists or the request was silently rate-limited (email-enumeration
    protection)."""
    user = get_user_by_email(db, email)
    if not user:
        return
    if (
        count_recent_events(db, email=email, event_type=PASSWORD_RESET_REQUESTED, within=timedelta(hours=1))
        >= PASSWORD_RESET_MAX_PER_HOUR
    ):
        return

    now = utc_now()
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
    ).update({"used_at": now})

    plaintext = generate_refresh_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_refresh_token(plaintext),
            expires_at=now + timedelta(minutes=settings.password_reset_expiry_minutes),
        )
    )
    log_event(db, event_type=PASSWORD_RESET_REQUESTED, email=user.email, user_id=user.id, tenant_id=user.tenant_id)
    db.commit()
    try:
        send_password_reset_email(to=user.email, first_name=user.first_name, token=plaintext)
    except EmailSendError:
        # Never raise here — the caller always returns the same generic response regardless of
        # whether the email exists, was rate-limited, or genuinely failed to send (enumeration
        # protection). The failure is still logged so delivery problems are visible in ops.
        logger.exception("Failed to send password reset email to %s", user.email)


def reset_password(db: Session, token: str, new_password: str) -> None:
    token_hash = hash_refresh_token(token)
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
    if not record or record.used_at is not None:
        raise AuthError(400, "This password reset link is invalid or has already been used.")

    user = db.get(User, record.user_id)
    if as_aware_utc(record.expires_at) < utc_now():
        log_event(db, event_type=EXPIRED_PASSWORD_RESET_TOKEN, email=user.email if user else "", user_id=record.user_id)
        db.commit()
        raise AuthError(400, "This password reset link has expired. Request a new one.")
    if not user:
        raise AuthError(400, "This password reset link is invalid.")

    if verify_password(new_password, user.password_hash):
        raise AuthError(400, "New password must be different from your current password.")

    record.used_at = utc_now()
    user.password_hash = hash_password(new_password)
    user.failed_attempts = 0
    user.locked_until = None
    user.session_invalidated_at = utc_now()
    db.add(record)
    db.add(user)

    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)).update(
        {"revoked": True}
    )
    log_event(db, event_type=PASSWORD_CHANGED, email=user.email, user_id=user.id, tenant_id=user.tenant_id)
    db.commit()


def update_profile(db: Session, user: User, payload: UpdateProfileRequest) -> User:
    if payload.mobile and payload.mobile != user.mobile:
        existing = get_user_by_mobile(db, payload.mobile)
        if existing and existing.id != user.id:
            raise AuthError(400, "This mobile number is already registered to another account")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AuthError(400, "This mobile number is already registered to another account") from None
    db.refresh(user)
    return user


def change_password(db: Session, user: User, current_password: str, new_password: str) -> tuple[str, str]:
    """Unlike forgot-password reset (where the user isn't authenticated anywhere), an in-session
    change keeps THIS session alive: all refresh tokens are revoked and session_invalidated_at
    is set (logging out every other session), then a fresh token pair is issued immediately so
    the caller can swap tokens without being kicked out themselves."""
    if not verify_password(current_password, user.password_hash):
        raise AuthError(401, "Current password is incorrect")
    if verify_password(new_password, user.password_hash):
        raise AuthError(400, "New password must be different from your current password.")

    user.password_hash = hash_password(new_password)
    user.session_invalidated_at = utc_now()
    db.add(user)

    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)).update(
        {"revoked": True}
    )
    log_event(db, event_type=PASSWORD_CHANGED, email=user.email, user_id=user.id, tenant_id=user.tenant_id)
    db.commit()

    return issue_tokens(db, user)


def save_avatar(db: Session, user: User, content: bytes, content_type: str) -> User:
    if content_type not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise AuthError(400, "Avatar must be a JPEG, PNG, or WebP image")
    if len(content) > MAX_AVATAR_SIZE_BYTES:
        raise AuthError(400, "Avatar must be smaller than 2MB")

    ext = ALLOWED_AVATAR_CONTENT_TYPES[content_type]
    url = upload_file(f"avatars/{user.id}.{ext}", content, content_type)

    user.avatar_url = f"{url}?v={int(utc_now().timestamp())}"
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_login_history(db: Session, user: User, page: int = 1, page_size: int = 20) -> tuple[list[AuthAuditLog], int]:
    query = db.query(AuthAuditLog).filter(
        AuthAuditLog.user_id == user.id,
        AuthAuditLog.event_type.in_([LOGIN_SUCCESS, LOGOUT, FAILED_LOGIN]),
    )
    total = query.with_entities(func.count(AuthAuditLog.id)).scalar() or 0
    items = query.order_by(AuthAuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def authenticate(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if not user:
        raise AuthError(401, "Invalid credentials")

    if user.locked_until and as_aware_utc(user.locked_until) > utc_now():
        raise AuthError(401, "Account temporarily locked due to repeated failed login attempts. Try again later.")

    if not verify_password(password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            user.locked_until = utc_now() + LOCKOUT_DURATION
        db.add(user)
        log_event(db, event_type=FAILED_LOGIN, email=email, user_id=user.id, tenant_id=user.tenant_id)
        db.commit()
        raise AuthError(401, "Invalid credentials")

    if user.status == "pending_verification":
        raise AuthError(403, "Your email address has not been verified. Please verify your email before signing in.")
    if user.status != "active":
        raise AuthError(401, "Account is not active")

    tenant = db.get(Tenant, user.tenant_id)
    if not tenant or tenant.status != "active":
        raise AuthError(403, "This account has been suspended. Please contact support.")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.failed_attempts = 0
    user.locked_until = None
    user.last_login = utc_now()
    db.add(user)
    log_event(db, event_type=LOGIN_SUCCESS, email=user.email, user_id=user.id, tenant_id=user.tenant_id)
    db.commit()
    return user


def issue_tokens(db: Session, user: User, remember_me: bool = False) -> tuple[str, str]:
    access_token = create_access_token(user.id, user.tenant_id)
    refresh_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_token_expiry(remember_me),
            remembered=remember_me,
        )
    )
    db.commit()
    return access_token, refresh_token


def rotate_refresh_token(db: Session, refresh_token: str) -> tuple[User, str, str]:
    token_hash = hash_refresh_token(refresh_token)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not record or record.revoked or as_aware_utc(record.expires_at) < utc_now():
        raise AuthError(401, "Invalid or expired refresh token")

    user = db.get(User, record.user_id)
    if not user or user.status != "active":
        raise AuthError(401, "User not found")

    tenant = db.get(Tenant, user.tenant_id)
    if not tenant or tenant.status != "active":
        raise AuthError(403, "This account has been suspended. Please contact support.")

    record.revoked = True
    db.add(record)
    # Carry the original "remember me" choice forward so a remembered session doesn't quietly
    # downgrade to the short-lived expiry on its first token refresh.
    access_token, new_refresh_token = issue_tokens(db, user, remember_me=record.remembered)
    return user, access_token, new_refresh_token


def revoke_refresh_token(db: Session, refresh_token: str) -> None:
    token_hash = hash_refresh_token(refresh_token)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if record and not record.revoked:
        record.revoked = True
        db.add(record)
        # /logout takes no auth header, so the user is resolved from the refresh token itself
        # (which is what proves who's logging out) purely to attribute the audit event.
        user = db.get(User, record.user_id)
        if user:
            log_event(db, event_type=LOGOUT, email=user.email, user_id=user.id, tenant_id=user.tenant_id)
        db.commit()


def get_tenant(db: Session, tenant_id: str) -> Tenant | None:
    return db.get(Tenant, tenant_id)


def update_tenant_profile(db: Session, tenant: Tenant, payload: TenantUpdate) -> Tenant:
    if payload.phone and payload.phone != tenant.phone:
        existing = get_tenant_by_phone(db, payload.phone)
        if existing and existing.id != tenant.id:
            raise AuthError(400, "This mobile number is already registered to another account")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    db.add(tenant)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AuthError(400, "This mobile number is already registered to another account") from None
    db.refresh(tenant)
    return tenant


def list_team_members(db: Session, tenant_id: str) -> list[User]:
    return db.query(User).filter(User.tenant_id == tenant_id).order_by(User.first_name).all()


def create_team_member(db: Session, tenant_id: str, payload: TeamMemberCreate) -> User:
    if get_user_by_email(db, payload.email):
        raise AuthError(400, "Email already registered")
    if payload.mobile and get_user_by_mobile(db, payload.mobile):
        raise AuthError(400, "This mobile number is already registered to another account")

    assert_feature(db, tenant_id, "user_management")
    user_count = db.query(func.count(User.id)).filter(User.tenant_id == tenant_id).scalar() or 0
    assert_under_limit(db, tenant_id, "max_users", user_count)

    user = User(
        tenant_id=tenant_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        mobile=payload.mobile,
        password_hash=hash_password(payload.password),
        role=payload.role,
        status="active",
        is_email_verified=False,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AuthError(400, "This email or mobile number is already registered to another account") from None
    db.refresh(user)
    return user
