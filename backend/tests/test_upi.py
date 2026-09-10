from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest

from app.core.upi import UpiConfigError, build_upi_uri, is_configured


def _params(uri: str) -> dict[str, str]:
    parsed = urlparse(uri)
    assert parsed.scheme == "upi"
    assert parsed.netloc == "pay"
    return {k: v[0] for k, v in parse_qs(parsed.query).items()}


def test_includes_the_payee_address_that_makes_a_qr_payable():
    # The regression this guards: the original payment QR encoded upi://pay?pn=...&am=... with no
    # `pa=` at all. `pa` is the one required field in the UPI deep-link spec, so that QR scanned
    # fine and could never actually be paid by any UPI app.
    params = _params(build_upi_uri(vpa="business@upi", payee_name="ABC Restaurant", amount=850))
    assert params["pa"] == "business@upi"
    assert params["pn"] == "ABC Restaurant"


def test_dynamic_qr_carries_the_exact_amount_and_currency():
    params = _params(build_upi_uri(vpa="business@upi", amount=1250.5))
    assert params["am"] == "1250.50"
    assert params["cu"] == "INR"


def test_static_qr_omits_the_amount_so_the_customer_enters_it():
    params = _params(build_upi_uri(vpa="business@upi"))
    assert "am" not in params
    assert params["pa"] == "business@upi"


def test_a_non_positive_amount_degrades_to_a_static_link_rather_than_an_unpayable_one():
    # A zero/negative "amount due" is a fully-settled bill, not a payment request — emitting am=0
    # would produce something a bank app rejects outright.
    assert "am" not in _params(build_upi_uri(vpa="business@upi", amount=0))
    assert "am" not in _params(build_upi_uri(vpa="business@upi", amount=-5))


def test_reference_and_note_are_carried_into_the_customers_statement():
    params = _params(
        build_upi_uri(vpa="business@upi", amount=100, transaction_ref="INV-1025", transaction_note="Invoice INV-1025")
    )
    assert params["tr"] == "INV-1025"
    assert params["tn"] == "Invoice INV-1025"


def test_merchant_name_with_query_characters_cannot_corrupt_the_link():
    # A business legitimately named "Tea & Co = Best" must not inject extra UPI parameters.
    params = _params(build_upi_uri(vpa="business@upi", payee_name="Tea & Co = Best", amount=10))
    assert params["pn"] == "Tea & Co = Best"
    assert params["am"] == "10.00"


def test_refuses_to_build_a_link_with_no_vpa():
    for missing in (None, "", "   "):
        assert is_configured(missing) is False
        with pytest.raises(UpiConfigError):
            build_upi_uri(vpa=missing, amount=100)


def test_is_configured_accepts_a_real_vpa():
    assert is_configured("business@upi") is True
