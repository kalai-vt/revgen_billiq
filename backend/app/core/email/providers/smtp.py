from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.email.protocol import EmailMessage, EmailSendError


class SmtpEmailProvider:
    def send(self, message: EmailMessage) -> None:
        mime_message = MIMEMultipart("alternative")
        mime_message["Subject"] = message.subject
        mime_message["From"] = settings.email_from
        mime_message["To"] = message.to
        mime_message.attach(MIMEText(message.text_body, "plain"))
        mime_message.attach(MIMEText(message.html_body, "html"))

        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                if settings.smtp_username:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.sendmail(settings.email_from, [message.to], mime_message.as_string())
        except (smtplib.SMTPException, OSError) as exc:
            raise EmailSendError(f"Failed to send email via SMTP: {exc}") from exc
