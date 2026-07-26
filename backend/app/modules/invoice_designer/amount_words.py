from __future__ import annotations

_ONES = (
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
)
_TENS = ("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")


def _under_thousand(n: int) -> str:
    if n == 0:
        return ""
    if n < 20:
        return _ONES[n]
    if n < 100:
        return (_TENS[n // 10] + (f" {_ONES[n % 10]}" if n % 10 else "")).strip()
    return (_ONES[n // 100] + " Hundred" + (f" and {_under_thousand(n % 100)}" if n % 100 else "")).strip()


def _integer_to_words_indian(n: int) -> str:
    """Indian numbering system: thousand / lakh / crore groupings."""
    if n == 0:
        return "Zero"
    parts: list[str] = []
    crore, n = divmod(n, 10_000_000)
    lakh, n = divmod(n, 100_000)
    thousand, n = divmod(n, 1_000)
    if crore:
        parts.append(f"{_under_thousand(crore)} Crore")
    if lakh:
        parts.append(f"{_under_thousand(lakh)} Lakh")
    if thousand:
        parts.append(f"{_under_thousand(thousand)} Thousand")
    if n:
        parts.append(_under_thousand(n))
    return " ".join(parts)


def amount_in_words_inr(amount: float, currency_label: str = "Rupees") -> str:
    """Best-effort currency-in-words for the "Amount in Words" summary line.

    Uses the Indian numbering system (lakh/crore) regardless of tenant currency, since that's
    the overwhelmingly common case for this product; a future phase can branch on
    settings.currency for other locales.
    """
    rupees = int(amount)
    paise = round((amount - rupees) * 100)
    words = f"{currency_label} {_integer_to_words_indian(rupees)}"
    if paise:
        words += f" and {_under_thousand(paise)} Paise"
    return f"{words} Only"
