from __future__ import annotations

from app.core.config import settings
from app.core.email import factory
from app.core.email.protocol import EmailMessage
from app.core.email.templates import password_reset_email, verification_email


def send_verification_email(*, to: str, first_name: str, token: str) -> None:
    verify_url = f"{settings.app_url}/verify-email?token={token}"
    subject, html, text = verification_email(
        first_name=first_name, verify_url=verify_url, expiry_hours=settings.verification_token_expiry_hours
    )
    factory.get_email_provider().send(EmailMessage(to=to, subject=subject, html_body=html, text_body=text))


def send_password_reset_email(*, to: str, first_name: str, token: str) -> None:
    reset_url = f"{settings.app_url}/reset-password?token={token}"
    subject, html, text = password_reset_email(
        first_name=first_name, reset_url=reset_url, expiry_minutes=settings.password_reset_expiry_minutes
    )
    factory.get_email_provider().send(EmailMessage(to=to, subject=subject, html_body=html, text_body=text))
