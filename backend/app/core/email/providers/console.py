from __future__ import annotations

from app.core.email.protocol import EmailMessage


class ConsoleEmailProvider:
    """Local-dev default: prints the email instead of sending it (no SMTP/API credentials required).

    Prints to stdout (not `logging`) so it's visible by default under `uvicorn` without any
    logging configuration, mirroring Django's/Laravel's console/log mail backend convention.
    """

    def send(self, message: EmailMessage) -> None:
        print(
            f"\n----- EMAIL (console provider) -----\n"
            f"To: {message.to}\nSubject: {message.subject}\n\n{message.text_body}\n"
            f"-------------------------------------\n"
        )
