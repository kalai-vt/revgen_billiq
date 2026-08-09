from __future__ import annotations

from app.core.whatsapp.protocol import WhatsAppProvider
from app.core.whatsapp.providers.console import ConsoleWhatsAppProvider


def get_whatsapp_provider() -> WhatsAppProvider:
    """Mirrors app/core/sms/factory.py. Only "console" exists today — see
    REVGENIQ_WHATSAPP_PROVIDER."""
    return ConsoleWhatsAppProvider()
