from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.email.service import send_admin_invite_email
from app.core.security import generate_refresh_token, hash_password, hash_refresh_token, verify_password
from app.core.timeutils import as_aware_utc, utc_now
from app.models_admin.admin_user import ADMIN_ROLES, AdminUser
from app.models_admin.invite_token import AdminInviteToken

INVITE_EXPIRY = timedelta(hours=72)


class AdminStaffError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def list_staff(admin_db: Session) -> list[AdminUser]:
    return admin_db.query(AdminUser).order_by(AdminUser.created_at.desc()).all()


def invite_staff(
    admin_db: Session, *, inviting_admin: AdminUser, first_name: str, last_name: str, email: str, role: str
) -> AdminUser:
    if role not in ADMIN_ROLES:
        raise AdminStaffError(400, f"Invalid role. Must be one of: {', '.join(ADMIN_ROLES)}")
    if admin_db.query(AdminUser).filter(AdminUser.email == email).first():
        raise AdminStaffError(409, "An admin account with this email already exists")

    admin = AdminUser(
        first_name=first_name,
        last_name=last_name,
        email=email,
        password_hash=hash_password(generate_refresh_token()),
        role=role,
        status="pending",
        is_active=True,
        must_change_password=True,
        invited_by_admin_id=inviting_admin.id,
    )
    admin_db.add(admin)
    admin_db.flush()

    plaintext = generate_refresh_token()
    admin_db.add(
        AdminInviteToken(
            admin_user_id=admin.id,
            token_hash=hash_refresh_token(plaintext),
            expires_at=utc_now() + INVITE_EXPIRY,
        )
    )
    admin_db.commit()
    admin_db.refresh(admin)

    send_admin_invite_email(to=admin.email, first_name=admin.first_name, token=plaintext, role=admin.role)
    return admin


def update_role(admin_db: Session, admin_user_id: str, role: str) -> AdminUser:
    if role not in ADMIN_ROLES:
        raise AdminStaffError(400, f"Invalid role. Must be one of: {', '.join(ADMIN_ROLES)}")
    admin = admin_db.get(AdminUser, admin_user_id)
    if not admin:
        raise AdminStaffError(404, "Admin user not found")
    admin.role = role
    admin_db.add(admin)
    admin_db.commit()
    admin_db.refresh(admin)
    return admin


def set_active_status(admin_db: Session, admin_user_id: str, is_active: bool) -> AdminUser:
    admin = admin_db.get(AdminUser, admin_user_id)
    if not admin:
        raise AdminStaffError(404, "Admin user not found")
    admin.is_active = is_active
    admin.status = "active" if is_active else "suspended"
    admin_db.add(admin)
    admin_db.commit()
    admin_db.refresh(admin)
    return admin


def accept_invite(admin_db: Session, token: str, password: str) -> AdminUser:
    token_hash = hash_refresh_token(token)
    record = admin_db.query(AdminInviteToken).filter(AdminInviteToken.token_hash == token_hash).first()
    if not record or record.used_at is not None or as_aware_utc(record.expires_at) < utc_now():
        raise AdminStaffError(400, "This invite link is invalid or has expired")

    admin = admin_db.get(AdminUser, record.admin_user_id)
    if not admin:
        raise AdminStaffError(404, "Admin user not found")

    admin.password_hash = hash_password(password)
    admin.must_change_password = False
    admin.status = "active"
    record.used_at = utc_now()
    admin_db.add(admin)
    admin_db.add(record)
    admin_db.commit()
    admin_db.refresh(admin)
    return admin


def change_own_password(admin_db: Session, admin: AdminUser, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, admin.password_hash):
        raise AdminStaffError(401, "Current password is incorrect")
    admin.password_hash = hash_password(new_password)
    admin.must_change_password = False
    admin_db.add(admin)
    admin_db.commit()
