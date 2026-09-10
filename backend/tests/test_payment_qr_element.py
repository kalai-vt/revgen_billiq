from __future__ import annotations

from app.core.upi import payment_qr_enabled, should_render_payment_qr


def _render(**overrides) -> bool:
    kwargs = {"enabled": True, "visibility": "unpaid_only", "amount_due": 750.0, "vpa": "business@upi"}
    kwargs.update(overrides)
    return should_render_payment_qr(**kwargs)


def test_renders_for_a_bill_that_still_has_something_outstanding():
    assert _render() is True


def test_hidden_once_the_bill_is_settled():
    # A scannable QR on a fully-paid bill is an invitation to pay twice.
    assert _render(amount_due=0) is False
    assert _render(amount_due=-10) is False


def test_always_visibility_keeps_the_qr_on_a_settled_bill():
    # The spec allows either behaviour on a paid invoice; this is the "show Paid" configuration.
    assert _render(visibility="always", amount_due=0) is True


def test_never_visibility_wins_over_everything():
    assert _render(visibility="never") is False
    assert _render(visibility="never", amount_due=5000) is False


def test_no_qr_at_all_without_a_merchant_vpa():
    # Without a payee there is no payable link, so the element renders nothing rather than an
    # unpayable QR — the exact failure the old pa-less URI shipped with.
    for missing in (None, "", "  "):
        assert _render(vpa=missing) is False


def test_disabled_element_renders_nothing():
    assert _render(enabled=False) is False


def test_the_legacy_switch_still_turns_the_element_on():
    # Templates saved before PaymentQrConfig existed only carry qr_barcode.payment_qr; their QR
    # must not silently disappear when the richer element ships.
    assert payment_qr_enabled(True, False) is True
    assert payment_qr_enabled(False, True) is True
    assert payment_qr_enabled(False, False) is False
