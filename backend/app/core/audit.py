from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.timeutils import utc_now
from app.models.auth_audit import AuthAuditLog

USER_REGISTERED = "user_registered"
VERIFICATION_EMAIL_SENT = "verification_email_sent"
VERIFICATION_EMAIL_RESENT = "verification_email_resent"
EMAIL_VERIFIED = "email_verified"
PASSWORD_RESET_REQUESTED = "password_reset_requested"
PASSWORD_CHANGED = "password_changed"
FAILED_LOGIN = "failed_login"
FAILED_VERIFICATION = "failed_verification"
EXPIRED_VERIFICATION_TOKEN = "expired_verification_token"
EXPIRED_PASSWORD_RESET_TOKEN = "expired_password_reset_token"
LOGIN_SUCCESS = "login_success"
LOGOUT = "logout"


def log_event(
    db: Session,
    *,
    event_type: str,
    email: str,
    user_id: str | None = None,
    tenant_id: str | None = None,
) -> None:
    db.add(AuthAuditLog(event_type=event_type, email=email, user_id=user_id, tenant_id=tenant_id))


def count_recent_events(db: Session, *, email: str, event_type: str, within: timedelta) -> int:
    cutoff = utc_now() - within
    return (
        db.query(func.count(AuthAuditLog.id))
        .filter(
            AuthAuditLog.email == email,
            AuthAuditLog.event_type == event_type,
            AuthAuditLog.created_at >= cutoff,
        )
        .scalar()
        or 0
    )
