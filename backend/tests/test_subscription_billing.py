from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.payments import razorpay_client
from tests.conftest import register_and_activate_standalone


def _register(client: TestClient, email: str = "owner@acme.test") -> dict:
    payload = {
        "company_name": "Acme Retail",
        "legal_name": "Acme Retail Ltd",
        "email": email,
        "phone": "+15551234567",
        "password": "StrongPass!123",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "country": "US",
        "currency": "USD",
        "timezone": "UTC",
    }
    return register_and_activate_standalone(client, payload)


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def test_checkout_returns_503_when_razorpay_not_configured(client: TestClient) -> None:
    # Default test settings have no Razorpay credentials — this is the "billing isn't set up yet"
    # state every environment starts in, and it must fail clearly rather than crash.
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.post("/api/billing/checkout", headers=headers)
    assert response.status_code == 503


def test_checkout_creates_order_for_tenants_own_plan(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(razorpay_client, "is_configured", lambda: True)
    monkeypatch.setattr(
        razorpay_client,
        "create_order",
        lambda *, amount_paise, receipt, notes: {"id": "order_fake123"},
    )
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.post("/api/billing/checkout", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["order_id"] == "order_fake123"
    assert data["plan"] == "basic"
    assert data["amount_inr"] == 999


def test_verify_rejects_bad_signature(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(razorpay_client, "verify_payment_signature", lambda **kwargs: False)
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.post(
        "/api/billing/verify",
        json={"razorpay_order_id": "order_x", "razorpay_payment_id": "pay_x", "razorpay_signature": "bad"},
        headers=headers,
    )
    assert response.status_code == 400


def test_verify_activates_subscription_on_valid_signature(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(razorpay_client, "is_configured", lambda: True)
    monkeypatch.setattr(
        razorpay_client, "create_order", lambda *, amount_paise, receipt, notes: {"id": "order_real1"}
    )
    monkeypatch.setattr(razorpay_client, "verify_payment_signature", lambda **kwargs: True)

    owner = _register(client)
    headers = _headers(owner["access_token"])

    checkout = client.post("/api/billing/checkout", headers=headers)
    order_id = checkout.json()["data"]["order_id"]

    verify = client.post(
        "/api/billing/verify",
        json={"razorpay_order_id": order_id, "razorpay_payment_id": "pay_real1", "razorpay_signature": "sig"},
        headers=headers,
    )
    assert verify.status_code == 200, verify.text
    assert verify.json()["data"]["status"] == "paid"

    payments = client.get("/api/billing/payments", headers=headers)
    assert payments.status_code == 200
    items = payments.json()["data"]
    assert len(items) == 1
    assert items[0]["status"] == "paid"


def test_webhook_rejects_invalid_signature(client: TestClient) -> None:
    response = client.post(
        "/api/billing/webhook", content=b'{"event": "payment.captured"}', headers={"X-Razorpay-Signature": "bad"}
    )
    assert response.status_code == 400


def test_webhook_signature_helper_returns_false_without_secret() -> None:
    # No REVGENIQ_RAZORPAY_WEBHOOK_SECRET set in the test environment — this must fail closed,
    # not raise, so an unconfigured webhook endpoint never accidentally trusts a payload.
    assert razorpay_client.verify_webhook_signature(body=b"{}", signature="anything") is False
