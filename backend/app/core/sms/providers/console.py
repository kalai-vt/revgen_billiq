from __future__ import annotations

import uuid

from app.core.sms.protocol import SmsMessage, SmsSendResult


class ConsoleSmsProvider:
    """Local-dev / not-yet-configured default: prints the SMS instead of sending it. No SMS
    provider (Twilio, MSG91, etc.) is integrated in this codebase yet — see REVGENIQ_SMS_PROVIDER
    in app/core/config.py. Sending through this provider is NOT VERIFIED as reaching a real phone;
    it only proves the app-side send path (template rendering, logging, history) works."""

    def send(self, message: SmsMessage) -> SmsSendResult:
        print(
            f"\n----- SMS (console provider — NOT actually delivered) -----\n"
            f"To: {message.to}\n\n{message.body}\n"
            f"-------------------------------------------------------------\n"
        )
        return SmsSendResult(provider_message_id=f"console-{uuid.uuid4().hex[:12]}")
