from __future__ import annotations

import httpx

from app.core.config import settings
from app.core.email.protocol import EmailMessage, EmailSendError


class ResendEmailProvider:
    _API_URL = "https://api.resend.com/emails"

    def send(self, message: EmailMessage) -> None:
        try:
            response = httpx.post(
                self._API_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [message.to],
                    "subject": message.subject,
                    "html": message.html_body,
                    "text": message.text_body,
                },
                timeout=10.0,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise EmailSendError(f"Failed to send email via Resend: {exc}") from exc
