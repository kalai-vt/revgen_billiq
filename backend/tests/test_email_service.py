from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.core.email.protocol import EmailMessage
from app.core.email.providers.console import ConsoleEmailProvider
from app.core.email.providers.smtp import SmtpEmailProvider
from app.core.email.templates import password_reset_email, verification_email


def test_verification_email_template_contains_key_elements() -> None:
    subject, html, text = verification_email(first_name="Ada", verify_url="https://app.test/verify-email?token=abc", expiry_hours=24)
    assert "Verify" in subject
    assert "https://app.test/verify-email?token=abc" in html
    assert "https://app.test/verify-email?token=abc" in text
    assert "24 hours" in html
    assert "24 hours" in text
    assert "RevGen BillIQ" in html


def test_password_reset_email_template_contains_key_elements() -> None:
    subject, html, text = password_reset_email(first_name="Ada", reset_url="https://app.test/reset-password?token=xyz", expiry_minutes=15)
    assert "Reset" in subject
    assert "https://app.test/reset-password?token=xyz" in html
    assert "15 minutes" in html
    assert "didn't request" in html.lower() or "didn&#x27;t request" in html.lower()


def test_console_provider_does_not_raise(capsys) -> None:
    provider = ConsoleEmailProvider()
    provider.send(EmailMessage(to="user@test.com", subject="Hi", html_body="<p>hi</p>", text_body="hi"))
    captured = capsys.readouterr()
    assert "user@test.com" in captured.out


def test_smtp_provider_sends_via_smtplib() -> None:
    with patch("app.core.email.providers.smtp.smtplib.SMTP") as smtp_cls:
        smtp_instance = MagicMock()
        smtp_cls.return_value.__enter__.return_value = smtp_instance
        provider = SmtpEmailProvider()
        provider.send(EmailMessage(to="user@test.com", subject="Hi", html_body="<p>hi</p>", text_body="hi"))
        smtp_instance.starttls.assert_called_once()
        smtp_instance.sendmail.assert_called_once()
