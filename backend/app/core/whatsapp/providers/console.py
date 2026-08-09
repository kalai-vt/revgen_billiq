from __future__ import annotations

import uuid

from app.core.whatsapp.protocol import WhatsAppMessage, WhatsAppSendResult


class ConsoleWhatsAppProvider:
    """Local-dev / not-yet-configured default: prints the message instead of sending it. No
    WhatsApp Business API provider is integrated in this codebase yet — see
    REVGENIQ_WHATSAPP_PROVIDER in app/core/config.py. Sending through this provider is NOT
    VERIFIED as reaching a real WhatsApp account; it only proves the app-side send path (template
    rendering, logging, history) works."""

    def send(self, message: WhatsAppMessage) -> WhatsAppSendResult:
        print(
            f"\n----- WHATSAPP (console provider — NOT actually delivered) -----\n"
            f"To: {message.to}\n\n{message.body}\n"
            f"------------------------------------------------------------------\n"
        )
        return WhatsAppSendResult(provider_message_id=f"console-{uuid.uuid4().hex[:12]}")
