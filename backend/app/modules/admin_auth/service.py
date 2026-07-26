from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.admin_security import admin_refresh_token_expiry, create_admin_access_token
from app.core.security import (
    generate_refresh_token,
    hash_refresh_token,
    needs_rehash,
    hash_password,
    verify_password,
)
from app.core.timeutils import as_aware_utc, utc_now
from app.models_admin.admin_user import AdminUser
from app.models_admin.token import AdminRefreshToken

MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)


class AdminAuthError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def get_admin_by_email(db: Session, email: str) -> AdminUser | None:
    return db.query(AdminUser).filter(AdminUser.email == email).first()


def authenticate_admin(db: Session, email: str, password: str) -> AdminUser:
    admin = get_admin_by_email(db, email)
    if not admin:
        raise AdminAuthError(401, "Invalid credentials")

    if admin.locked_until and as_aware_utc(admin.locked_until) > utc_now():
        raise AdminAuthError(401, "Account temporarily locked due to repeated failed login attempts. Try again later.")

    if not verify_password(password, admin.password_hash):
        admin.failed_attempts += 1
        if admin.failed_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            admin.locked_until = utc_now() + LOCKOUT_DURATION
        db.add(admin)
        db.commit()
        raise AdminAuthError(401, "Invalid credentials")

    if admin.status != "active":
        raise AdminAuthError(401, "Account is not active")

    if needs_rehash(admin.password_hash):
        admin.password_hash = hash_password(password)
    admin.failed_attempts = 0
    admin.locked_until = None
    admin.last_login = utc_now()
    db.add(admin)
    db.commit()
    return admin


def issue_admin_tokens(db: Session, admin: AdminUser) -> tuple[str, str]:
    access_token = create_admin_access_token(admin.id, admin.role)
    refresh_token = generate_refresh_token()
    db.add(
        AdminRefreshToken(
            admin_user_id=admin.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=admin_refresh_token_expiry(),
        )
    )
    db.commit()
    return access_token, refresh_token


def rotate_admin_refresh_token(db: Session, refresh_token: str) -> tuple[AdminUser, str, str]:
    token_hash = hash_refresh_token(refresh_token)
    record = db.query(AdminRefreshToken).filter(AdminRefreshToken.token_hash == token_hash).first()
    if not record or record.revoked or as_aware_utc(record.expires_at) < utc_now():
        raise AdminAuthError(401, "Invalid or expired refresh token")

    admin = db.get(AdminUser, record.admin_user_id)
    if not admin or admin.status != "active":
        raise AdminAuthError(401, "Admin user not found")

    record.revoked = True
    db.add(record)
    access_token, new_refresh_token = issue_admin_tokens(db, admin)
    return admin, access_token, new_refresh_token


def revoke_admin_refresh_token(db: Session, refresh_token: str) -> None:
    token_hash = hash_refresh_token(refresh_token)
    record = db.query(AdminRefreshToken).filter(AdminRefreshToken.token_hash == token_hash).first()
    if record and not record.revoked:
        record.revoked = True
        db.add(record)
        db.commit()
