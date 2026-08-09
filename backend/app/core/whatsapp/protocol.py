from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class WhatsAppMessage:
    to: str
    body: str


@dataclass
class WhatsAppSendResult:
    provider_message_id: str


class WhatsAppSendError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class WhatsAppProvider(Protocol):
    def send(self, message: WhatsAppMessage) -> WhatsAppSendResult: ...
