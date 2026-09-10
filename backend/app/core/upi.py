"""Builds `upi://pay` deep links for payment QR codes.

The single source of truth for the UPI URI, because getting it subtly wrong is invisible until a
real customer tries to pay: the app's original payment QR encoded
`upi://pay?pn=<company>&am=<amount>` with no `pa=` parameter at all. `pa` (payee address — the
merchant VPA) is the one *required* field in the UPI deep-link spec; without it there is no payee,
so every UPI app rejects the link. The QR scanned, looked plausible on the receipt, and could
never actually be paid.

Two levels are supported, per the restaurant/payments spec:
  * static  — merchant VPA only, no amount. The customer types the amount. Same QR every time,
              so it can be printed once and stuck on the counter.
  * dynamic — VPA plus the exact amount for one specific bill, so the customer cannot underpay or
              typo it. `tr`/`tn` carry the invoice reference into the customer's bank statement.

Scanning either one is NOT proof of payment — nothing here confirms anything. Confirmation has to
come from a provider webhook (see the `payment_verification` feature key), which is why this
module only ever builds a link and never touches payment state.
"""
from __future__ import annotations

from urllib.parse import quote


class UpiConfigError(ValueError):
    """Raised when a payable link is requested but the tenant has no VPA configured."""


def _clean(value: str | None) -> str:
    return (value or "").strip()


def is_configured(vpa: str | None) -> bool:
    """Whether a payable QR can be built at all. Callers use this to hide/disable the QR rather
    than rendering one that cannot be paid."""
    return bool(_clean(vpa))


def payment_qr_enabled(qr_barcode_payment_qr: bool, payment_qr_enabled_flag: bool) -> bool:
    """Either switch turns the element on.

    The richer PaymentQrConfig replaced a bare `qr_barcode.payment_qr` boolean; templates saved
    before it exists still carry only the old flag, and their QR must not silently vanish on
    upgrade.
    """
    return bool(qr_barcode_payment_qr or payment_qr_enabled_flag)


def should_render_payment_qr(*, enabled: bool, visibility: str, amount_due: float, vpa: str | None) -> bool:
    """Whether a payment QR belongs on this particular document.

    Independent of the render target so the PDF, the on-screen preview and the thermal receipt
    can never disagree about whether a bill shows a QR.
    """
    if not enabled or visibility == "never":
        return False
    if not is_configured(vpa):
        # No merchant VPA means the only QR we could draw is an unpayable one. Better to omit it.
        return False
    if visibility == "unpaid_only" and amount_due <= 0:
        return False
    return True


def build_upi_uri(
    *,
    vpa: str | None,
    payee_name: str | None = None,
    amount: float | None = None,
    transaction_ref: str | None = None,
    transaction_note: str | None = None,
    currency: str = "INR",
) -> str:
    """Builds a `upi://pay` URI. Omit `amount` for a static (customer-enters-amount) QR.

    Raises UpiConfigError when no VPA is configured — never returns a link that cannot be paid.
    """
    payee_vpa = _clean(vpa)
    if not payee_vpa:
        raise UpiConfigError("No UPI ID is configured for this business.")

    # `pa` first, then `pn`, matching the order every UPI app documents. Values are percent-encoded
    # with no safe characters, so a merchant name containing "&" or "=" can't corrupt the query.
    params: list[tuple[str, str]] = [("pa", payee_vpa)]

    name = _clean(payee_name)
    if name:
        params.append(("pn", name))

    if amount is not None:
        # UPI expects a plain decimal with at most 2 places; a negative or zero amount is not a
        # payable request, so those fall back to a static (no-amount) link rather than emitting
        # something a bank app would reject.
        if amount > 0:
            params.append(("am", f"{amount:.2f}"))
            params.append(("cu", currency))

    ref = _clean(transaction_ref)
    if ref:
        params.append(("tr", ref))

    note = _clean(transaction_note)
    if note:
        params.append(("tn", note))

    query = "&".join(f"{key}={quote(value, safe='')}" for key, value in params)
    return f"upi://pay?{query}"
