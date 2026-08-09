from __future__ import annotations

from app.core.config import settings
from app.core.sms.protocol import SmsProvider
from app.core.sms.providers.console import ConsoleSmsProvider


def get_sms_provider() -> SmsProvider:
    """Mirrors app/core/email/factory.py's dispatch pattern. Only "console" exists today — no
    real SMS provider is wired up (see REVGENIQ_SMS_PROVIDER); add a branch here (e.g. "twilio",
    "msg91") once real credentials are available, the same way resend/smtp were added to email."""
    return ConsoleSmsProvider()
