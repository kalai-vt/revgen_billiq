from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from tests.conftest import register_and_activate_standalone


def _register(client: TestClient, email: str = "owner@acme.test") -> dict:
    payload = {
        "company_name": "Acme Retail",
        "legal_name": "Acme Retail Ltd",
        "email": email,
        "phone": f"+1555{uuid.uuid4().int % 10_000_000:07d}",
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


def test_new_product_creates_notification(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, name="Notify Widget")

    response = client.get("/api/notifications", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["unread_count"] == 1
    assert any(n["type"] == "new_product" for n in data["items"])


def test_invoice_cancelled_creates_notification(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    ).json()["data"]
    client.post(f"/api/invoices/{invoice['id']}/void", headers=headers)

    response = client.get("/api/notifications", headers=headers)
    data = response.json()["data"]
    assert any(n["type"] == "invoice_cancelled" for n in data["items"])


def test_low_stock_notification_fires_only_on_downward_crossing(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    # reorder_level defaults to 5. Add 10 units (well above threshold) -> no low-stock event.
    client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "add", "quantity": 10, "reason": "purchase"},
        headers=headers,
    )
    after_add = client.get("/api/notifications", headers=headers).json()["data"]
    assert not any(n["type"] == "low_stock" for n in after_add["items"])

    # Reduce down to 3 (crossing below reorder_level=5) -> one low-stock event.
    client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "reduce", "quantity": 7, "reason": "damage"},
        headers=headers,
    )
    after_cross = client.get("/api/notifications", headers=headers).json()["data"]
    low_stock_events = [n for n in after_cross["items"] if n["type"] == "low_stock"]
    assert len(low_stock_events) == 1

    # Reduce further while still below threshold -> should NOT fire again.
    client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "reduce", "quantity": 1, "reason": "damage"},
        headers=headers,
    )
    after_second_reduce = client.get("/api/notifications", headers=headers).json()["data"]
    low_stock_events_2 = [n for n in after_second_reduce["items"] if n["type"] == "low_stock"]
    assert len(low_stock_events_2) == 1


def test_mark_read_and_mark_all_read(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, name="Widget A", identifier_value="WID-A")
    _create_product(client, headers, name="Widget B", identifier_value="WID-B")

    initial = client.get("/api/notifications", headers=headers).json()["data"]
    assert initial["unread_count"] == 2

    first_id = initial["items"][0]["id"]
    mark_one = client.post(f"/api/notifications/{first_id}/read", headers=headers)
    assert mark_one.status_code == 200
    assert mark_one.json()["data"]["is_read"] is True

    after_one = client.get("/api/notifications", headers=headers).json()["data"]
    assert after_one["unread_count"] == 1

    mark_all = client.post("/api/notifications/read-all", headers=headers)
    assert mark_all.status_code == 200

    after_all = client.get("/api/notifications", headers=headers).json()["data"]
    assert after_all["unread_count"] == 0


def test_unread_only_filter(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers)

    all_notifications = client.get("/api/notifications", headers=headers).json()["data"]
    notification_id = all_notifications["items"][0]["id"]
    client.post(f"/api/notifications/{notification_id}/read", headers=headers)

    unread = client.get("/api/notifications", params={"unread_only": True}, headers=headers).json()["data"]
    assert all(not n["is_read"] for n in unread["items"])


def test_notifications_are_tenant_scoped(client: TestClient) -> None:
    owner_a = _register(client, "owner-a@acme.test")
    headers_a = _headers(owner_a["access_token"])
    _create_product(client, headers_a)

    owner_b = _register(client, "owner-b@acme.test")
    headers_b = _headers(owner_b["access_token"])

    notifications_b = client.get("/api/notifications", headers=headers_b).json()["data"]
    assert notifications_b["total"] == 0
