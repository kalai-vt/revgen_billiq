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


def test_category_crud(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    create = client.post("/api/categories", json={"name": "Beverages", "description": "Drinks"}, headers=headers)
    assert create.status_code == 200
    category = create.json()["data"]
    assert category["name"] == "Beverages"

    update = client.put(f"/api/categories/{category['id']}", json={"name": "Cold Drinks"}, headers=headers)
    assert update.status_code == 200
    assert update.json()["data"]["name"] == "Cold Drinks"

    listed = client.get("/api/categories", headers=headers)
    assert len(listed.json()["data"]["items"]) == 1

    delete = client.delete(f"/api/categories/{category['id']}", headers=headers)
    assert delete.status_code == 200
    assert client.get("/api/categories", headers=headers).json()["data"]["items"] == []


def test_category_delete_blocked_when_assigned_to_product(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    category = client.post("/api/categories", json={"name": "Snacks"}, headers=headers).json()["data"]
    product = client.post(
        "/api/products",
        json={"name": "Chips", "identifier_value": "CHIPS-1", "selling_price": 5.0, "category_id": category["id"]},
        headers=headers,
    ).json()["data"]
    assert product["category_id"] == category["id"]
    assert product["category_name"] == "Snacks"

    delete = client.delete(f"/api/categories/{category['id']}", headers=headers)
    assert delete.status_code == 400


def test_category_is_tenant_scoped(client: TestClient) -> None:
    tenant_a = _register(client, "owner-a@acme.test")
    tenant_b = _register(client, "owner-b@acme.test")
    headers_a = _headers(tenant_a["access_token"])
    headers_b = _headers(tenant_b["access_token"])

    category = client.post("/api/categories", json={"name": "Only A"}, headers=headers_a).json()["data"]
    assert client.get("/api/categories", headers=headers_b).json()["data"]["items"] == []
    assert client.put(f"/api/categories/{category['id']}", json={"name": "Hijacked"}, headers=headers_b).status_code == 404
    assert client.delete(f"/api/categories/{category['id']}", headers=headers_b).status_code == 404
