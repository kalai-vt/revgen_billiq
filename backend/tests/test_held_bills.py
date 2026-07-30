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


def _inventory_quantity(client: TestClient, headers: dict, product_id: str) -> float:
    response = client.get("/api/inventory", params={"page_size": 100}, headers=headers)
    for row in response.json()["data"]["items"]:
        if row["product_id"] == product_id:
            return row["quantity"]
    raise AssertionError("product not found in inventory")


def test_hold_and_resume_bill_does_not_touch_inventory(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    stock_before = _inventory_quantity(client, headers, product["id"])

    hold_response = client.post(
        "/api/pos/held-bills",
        json={
            "lines": [{"product_id": product["id"], "quantity": 2}],
            "customer_name": "Walk-in",
            "notes": "Table 4",
            "payment_method": "cash",
        },
        headers=headers,
    )
    assert hold_response.status_code == 200
    held = hold_response.json()["data"]
    assert held["notes"] == "Table 4"
    assert held["lines"][0]["quantity"] == 2
    assert held["lines"][0]["product"]["id"] == product["id"]

    # Inventory is untouched while held.
    assert _inventory_quantity(client, headers, product["id"]) == stock_before

    list_response = client.get("/api/pos/held-bills", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()["data"]["total"] == 1

    detail_response = client.get(f"/api/pos/held-bills/{held['id']}", headers=headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["id"] == held["id"]

    delete_response = client.delete(f"/api/pos/held-bills/{held['id']}", headers=headers)
    assert delete_response.status_code == 200

    assert client.get("/api/pos/held-bills", headers=headers).json()["data"]["total"] == 0
    # Still untouched after delete — held bills never affect inventory at all.
    assert _inventory_quantity(client, headers, product["id"]) == stock_before


def test_held_bill_rejects_unknown_product(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.post(
        "/api/pos/held-bills",
        json={"lines": [{"product_id": "does-not-exist", "quantity": 1}]},
        headers=headers,
    )
    assert response.status_code == 404


def test_held_bills_are_tenant_scoped(client: TestClient) -> None:
    owner_a = _register(client, "owner-a@acme.test")
    headers_a = _headers(owner_a["access_token"])
    product_a = _create_product(client, headers_a)
    client.post(
        "/api/pos/held-bills",
        json={"lines": [{"product_id": product_a["id"], "quantity": 1}]},
        headers=headers_a,
    )

    owner_b = _register(client, "owner-b@acme.test")
    headers_b = _headers(owner_b["access_token"])
    assert client.get("/api/pos/held-bills", headers=headers_b).json()["data"]["total"] == 0


def test_delete_nonexistent_held_bill_returns_404(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    response = client.delete("/api/pos/held-bills/does-not-exist", headers=headers)
    assert response.status_code == 404
