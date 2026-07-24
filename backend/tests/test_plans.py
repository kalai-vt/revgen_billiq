from __future__ import annotations

from fastapi.testclient import TestClient

from app.core import plans as plans_module
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


def test_product_limit_enforced(client: TestClient, monkeypatch) -> None:
    monkeypatch.setitem(plans_module.PLANS["basic"], "max_products", 1)
    owner = _register(client)
    headers = _headers(owner["access_token"])

    first = client.post("/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers)
    assert first.status_code == 200

    second = client.post("/api/products", json={"name": "BB", "identifier_value": "B-1", "selling_price": 10}, headers=headers)
    assert second.status_code == 402


def test_customer_limit_enforced(client: TestClient, monkeypatch) -> None:
    monkeypatch.setitem(plans_module.PLANS["basic"], "max_customers", 1)
    owner = _register(client)
    headers = _headers(owner["access_token"])

    first = client.post("/api/customers", json={"name": "A"}, headers=headers)
    assert first.status_code == 200

    second = client.post("/api/customers", json={"name": "B"}, headers=headers)
    assert second.status_code == 402


def test_team_member_blocked_on_basic_then_allowed_on_explore(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    denied = client.post(
        "/api/auth/team",
        json={"first_name": "S", "last_name": "T", "email": "s@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    assert denied.status_code == 402

    client.put("/api/settings", json={"plan": "explore"}, headers=headers)
    allowed = client.post(
        "/api/auth/team",
        json={"first_name": "S", "last_name": "T", "email": "s2@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    assert allowed.status_code == 200


def test_monthly_invoice_limit_enforced(client: TestClient, monkeypatch) -> None:
    monkeypatch.setitem(plans_module.PLANS["basic"], "max_monthly_invoices", 1)
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = client.post(
        "/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers
    ).json()["data"]

    first = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "card"},
        headers=headers,
    )
    assert first.status_code == 200

    second = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "card"},
        headers=headers,
    )
    assert second.status_code == 402


def test_barcode_requires_explore_plan(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    denied = client.post(
        "/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10, "barcode": "123"}, headers=headers
    )
    assert denied.status_code == 402

    client.put("/api/settings", json={"plan": "explore"}, headers=headers)
    allowed = client.post(
        "/api/products", json={"name": "BB", "identifier_value": "B-1", "selling_price": 10, "barcode": "456"}, headers=headers
    )
    assert allowed.status_code == 200


def test_barcode_rejected_on_update_too(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = client.post(
        "/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers
    ).json()["data"]

    denied = client.put(f"/api/products/{product['id']}", json={"barcode": "999"}, headers=headers)
    assert denied.status_code == 402


def test_advanced_analytics_requires_explore_plan(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    basic_dashboard = client.get("/api/analytics/dashboard?days=7", headers=headers)
    assert basic_dashboard.status_code == 200

    denied = client.get("/api/analytics/dashboard?days=14&advanced=true", headers=headers)
    assert denied.status_code == 402

    client.put("/api/settings", json={"plan": "explore"}, headers=headers)
    allowed = client.get("/api/analytics/dashboard?days=14&advanced=true", headers=headers)
    assert allowed.status_code == 200


def test_gst_number_snapshotted_on_invoice(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"gst_number": "29ABCDE1234F1Z5"}, headers=headers)

    product = client.post(
        "/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers
    ).json()["data"]
    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "card"},
        headers=headers,
    ).json()["data"]
    assert invoice["gst_number"] == "29ABCDE1234F1Z5"

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"


def test_usage_endpoint_reports_plan_and_counts(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.post("/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers)

    usage = client.get("/api/billing/usage", headers=headers)
    assert usage.status_code == 200
    data = usage.json()["data"]
    assert data["plan"] == "basic"
    assert data["usage"]["products"]["used"] == 1
    assert data["usage"]["products"]["limit"] == 500
    assert data["features"]["barcode_support"] is False
