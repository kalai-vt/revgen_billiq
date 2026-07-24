from __future__ import annotations

from app.core.config import settings
from app.core.email.protocol import EmailProvider
from app.core.email.providers.console import ConsoleEmailProvider
from app.core.email.providers.resend import ResendEmailProvider
from app.core.email.providers.smtp import SmtpEmailProvider


def get_email_provider() -> EmailProvider:
    """Dispatches to the configured provider. Deliberately not cached — tests monkeypatch this
    function directly (via `app.core.email.factory`, module-qualified) to substitute a
    FakeEmailProvider that captures sent emails for token extraction."""
    if settings.email_provider == "smtp":
        return SmtpEmailProvider()
    if settings.email_provider == "resend":
        return ResendEmailProvider()
    return ConsoleEmailProvider()
