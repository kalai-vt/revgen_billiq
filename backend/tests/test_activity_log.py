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


def _create_product(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "Widget",
        "identifier_value": "WID-1",
        "cost_price": 5.0,
        "selling_price": 20.0,
        "tax_rate_percent": 0.0,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def test_product_create_update_delete_logged(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    client.put(f"/api/products/{product['id']}", json={"selling_price": 25.0}, headers=headers)
    client.delete(f"/api/products/{product['id']}", headers=headers)

    log = client.get("/api/activity-log", params={"module": "product"}, headers=headers)
    assert log.status_code == 200
    data = log.json()["data"]
    assert data["total"] == 3
    actions = {item["action"] for item in data["items"]}
    assert actions == {"created", "updated", "deleted"}
    assert all(item["user_name"] == "Ada Lovelace" for item in data["items"])


def test_invoice_create_and_cancel_logged(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    ).json()["data"]
    client.post(f"/api/invoices/{invoice['id']}/void", headers=headers)

    log = client.get("/api/activity-log", params={"module": "invoice"}, headers=headers)
    assert log.status_code == 200
    data = log.json()["data"]
    assert data["total"] == 2
    actions = {item["action"] for item in data["items"]}
    assert actions == {"created", "cancelled"}


def test_stock_adjustment_logged_as_inventory_module(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "add", "quantity": 10, "reason": "purchase"},
        headers=headers,
    )

    log = client.get("/api/activity-log", params={"module": "inventory"}, headers=headers)
    assert log.status_code == 200
    data = log.json()["data"]
    assert data["total"] == 1
    assert data["items"][0]["action"] == "stock_updated"


def test_sale_also_logs_inventory_activity(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    )

    log = client.get("/api/activity-log", params={"module": "inventory"}, headers=headers)
    data = log.json()["data"]
    assert data["total"] == 1
    assert "sale" in data["items"][0]["description"].lower()


def test_activity_log_role_gating(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=owner_headers)

    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=owner_headers,
    )
    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    denied = client.get("/api/activity-log", headers=staff_headers)
    assert denied.status_code == 403

    allowed = client.get("/api/activity-log", headers=owner_headers)
    assert allowed.status_code == 200


def test_activity_log_is_tenant_scoped(client: TestClient) -> None:
    owner_a = _register(client, "owner-a@acme.test")
    headers_a = _headers(owner_a["access_token"])
    _create_product(client, headers_a)

    owner_b = _register(client, "owner-b@acme.test")
    headers_b = _headers(owner_b["access_token"])

    log_b = client.get("/api/activity-log", headers=headers_b)
    assert log_b.json()["data"]["total"] == 0
