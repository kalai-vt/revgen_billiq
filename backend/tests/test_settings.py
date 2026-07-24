from __future__ import annotations

from fastapi.testclient import TestClient

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


def test_settings_created_on_registration_with_defaults(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.get("/api/settings", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["invoice_prefix"] == "INV"
    assert data["currency"] == "USD"
    assert data["theme"] == "light"
    assert data["gst_number"] is None


def test_settings_update(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.put(
        "/api/settings",
        json={"gst_number": "29ABCDE1234F1Z5", "invoice_prefix": "ACME", "theme": "dark"},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["gst_number"] == "29ABCDE1234F1Z5"
    assert data["invoice_prefix"] == "ACME"
    assert data["theme"] == "dark"


def test_settings_owner_only(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=owner_headers)

    client.post(
        "/api/auth/team",
        json={
            "first_name": "Sam",
            "last_name": "Staff",
            "email": "staff@acme.test",
            "password": "StaffPass!123",
            "role": "manager",
        },
        headers=owner_headers,
    )
    manager_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    manager_headers = _headers(manager_login.json()["data"]["access_token"])

    assert client.get("/api/settings", headers=manager_headers).status_code == 403
    assert client.put("/api/settings", json={"theme": "dark"}, headers=manager_headers).status_code == 403


def test_invoice_number_uses_custom_prefix(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"invoice_prefix": "ACME"}, headers=headers)

    product = client.post(
        "/api/products", json={"name": "Widget", "identifier_value": "WID-1", "selling_price": 10.0}, headers=headers
    ).json()["data"]
    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "card"},
        headers=headers,
    ).json()["data"]
    assert invoice["invoice_number"] == "ACME-000001"
