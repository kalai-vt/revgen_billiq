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


def test_products_sort_by_selling_price(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.post("/api/products", json={"name": "Cheap", "identifier_value": "P-1", "selling_price": 5}, headers=headers)
    client.post("/api/products", json={"name": "Expensive", "identifier_value": "P-2", "selling_price": 50}, headers=headers)

    asc = client.get("/api/products", params={"sort_by": "selling_price", "sort_dir": "asc"}, headers=headers)
    assert [p["name"] for p in asc.json()["data"]["items"]] == ["Cheap", "Expensive"]

    desc = client.get("/api/products", params={"sort_by": "selling_price", "sort_dir": "desc"}, headers=headers)
    assert [p["name"] for p in desc.json()["data"]["items"]] == ["Expensive", "Cheap"]


def test_products_rejects_invalid_sort_by(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    response = client.get("/api/products", params={"sort_by": "not_a_field"}, headers=headers)
    assert response.status_code == 422


def test_customers_sort_by_name_desc(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.post("/api/customers", json={"name": "Alpha"}, headers=headers)
    client.post("/api/customers", json={"name": "Zeta"}, headers=headers)

    response = client.get("/api/customers", params={"sort_by": "name", "sort_dir": "desc"}, headers=headers)
    assert [c["name"] for c in response.json()["data"]["items"]] == ["Zeta", "Alpha"]


def test_categories_sort_by_name_desc(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.post("/api/categories", json={"name": "Alpha"}, headers=headers)
    client.post("/api/categories", json={"name": "Zeta"}, headers=headers)

    response = client.get("/api/categories", params={"sort_by": "name", "sort_dir": "desc"}, headers=headers)
    assert [c["name"] for c in response.json()["data"]["items"]] == ["Zeta", "Alpha"]


def test_inventory_sort_by_quantity(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    low = client.post(
        "/api/products", json={"name": "Low Stock", "identifier_value": "INV-1", "selling_price": 10}, headers=headers
    ).json()["data"]
    high = client.post(
        "/api/products", json={"name": "High Stock", "identifier_value": "INV-2", "selling_price": 10}, headers=headers
    ).json()["data"]
    client.post(f"/api/inventory/{low['id']}/adjust", json={"movement_type": "add", "quantity": 5, "reason": "opening_stock"}, headers=headers)
    client.post(f"/api/inventory/{high['id']}/adjust", json={"movement_type": "add", "quantity": 50, "reason": "opening_stock"}, headers=headers)

    response = client.get("/api/inventory", params={"sort_by": "quantity", "sort_dir": "asc"}, headers=headers)
    names = [item["product_name"] for item in response.json()["data"]["items"]]
    assert names == ["Low Stock", "High Stock"]

    response_desc = client.get("/api/inventory", params={"sort_by": "quantity", "sort_dir": "desc"}, headers=headers)
    names_desc = [item["product_name"] for item in response_desc.json()["data"]["items"]]
    assert names_desc == ["High Stock", "Low Stock"]
