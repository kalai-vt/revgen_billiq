from __future__ import annotations

from typing import Any

import razorpay

from app.core.config import settings


class PaymentsNotConfiguredError(Exception):
    """Raised when a checkout/webhook call is attempted before real Razorpay credentials are set.
    Subscriptions keep working in the existing admin-managed-only mode either way — this only
    blocks the "pay for it yourself" path, never the Super Admin's ability to assign/change plans."""


_client: razorpay.Client | None = None


def is_configured() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


def _get_client() -> razorpay.Client:
    global _client
    if not is_configured():
        raise PaymentsNotConfiguredError(
            "Razorpay isn't configured for this environment (REVGENIQ_RAZORPAY_KEY_ID / "
            "REVGENIQ_RAZORPAY_KEY_SECRET are unset). Ask your administrator to change your plan "
            "manually in the meantime."
        )
    if _client is None:
        _client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    return _client


def create_order(*, amount_paise: int, receipt: str, notes: dict[str, str]) -> dict[str, Any]:
    """Creates a Razorpay Order for a one-time subscription charge. `amount_paise` is the amount
    in the smallest currency unit (paise, i.e. price_inr * 100) — Razorpay's API always takes
    amounts this way, never fractional rupees."""
    return _get_client().order.create(
        data={
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": notes,
        }
    )


def verify_webhook_signature(*, body: bytes, signature: str) -> bool:
    """Validates an inbound webhook actually came from Razorpay before trusting its payload —
    mirrors the same "verify before trust" contract as `CommerceProvider.verify_webhook`."""
    if not settings.razorpay_webhook_secret:
        return False
    try:
        razorpay.Utility(_get_client()).verify_webhook_signature(
            body.decode(), signature, settings.razorpay_webhook_secret
        )
        return True
    except razorpay.errors.SignatureVerificationError:
        return False


def verify_payment_signature(*, order_id: str, payment_id: str, signature: str) -> bool:
    """Validates the signature the frontend gets back after a successful Checkout.js payment,
    before the backend trusts that a charge actually succeeded."""
    try:
        _get_client().utility.verify_payment_signature(
            {"razorpay_order_id": order_id, "razorpay_payment_id": payment_id, "razorpay_signature": signature}
        )
        return True
    except razorpay.errors.SignatureVerificationError:
        return False
