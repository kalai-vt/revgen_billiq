from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class EmailMessage:
    to: str
    subject: str
    html_body: str
    text_body: str


class EmailSendError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class EmailProvider(Protocol):
    def send(self, message: EmailMessage) -> None: ...
