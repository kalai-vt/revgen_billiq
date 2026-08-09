from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class SmsMessage:
    to: str
    body: str


@dataclass
class SmsSendResult:
    """provider_message_id is whatever the provider hands back for delivery-status lookups later
    (e.g. Twilio's SID) — stored on TrialReminderLog so a real provider's status can eventually be
    reconciled. The console provider has no real delivery, so it returns a synthetic id."""

    provider_message_id: str


class SmsSendError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class SmsProvider(Protocol):
    def send(self, message: SmsMessage) -> SmsSendResult: ...
