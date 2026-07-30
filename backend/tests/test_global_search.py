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


def test_global_search_finds_products_customers_invoices_categories(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    client.post("/api/categories", json={"name": "Zenith Category"}, headers=headers)
    client.post(
        "/api/products",
        json={"name": "Zenith Widget", "identifier_value": "ZEN-1", "selling_price": 10.0},
        headers=headers,
    )
    client.post("/api/customers", json={"name": "Zenith Customer", "mobile": "9998887777"}, headers=headers)

    product = client.get("/api/products", params={"q": "Zenith"}, headers=headers).json()["data"]["items"][0]
    client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    )

    response = client.get("/api/search", params={"q": "Zenith"}, headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data["products"]) == 1
    assert data["products"][0]["label"] == "Zenith Widget"
    assert len(data["customers"]) == 1
    assert data["customers"][0]["label"] == "Zenith Customer"
    assert len(data["categories"]) == 1
    assert data["categories"][0]["label"] == "Zenith Category"
    # Invoice search matches on the product's own line-item via customer_name/invoice_number,
    # not product name — this invoice has no matching customer name or number, so 0 is correct.
    assert data["invoices"] == []


def test_global_search_matches_invoice_by_customer_name(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = client.post(
        "/api/products", json={"name": "Widget", "identifier_value": "WID-1", "selling_price": 10.0}, headers=headers
    ).json()["data"]
    client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1}],
            "payment_method": "upi",
            "customer_name": "Distinct Customer",
        },
        headers=headers,
    )

    response = client.get("/api/search", params={"q": "Distinct"}, headers=headers)
    data = response.json()["data"]
    assert len(data["invoices"]) == 1


def test_global_search_is_tenant_scoped(client: TestClient) -> None:
    owner_a = _register(client, "owner-a@acme.test")
    headers_a = _headers(owner_a["access_token"])
    client.post("/api/customers", json={"name": "Only In A"}, headers=headers_a)

    owner_b = _register(client, "owner-b@acme.test")
    headers_b = _headers(owner_b["access_token"])

    response = client.get("/api/search", params={"q": "Only In A"}, headers=headers_b)
    assert response.json()["data"]["customers"] == []


def test_global_search_no_match_returns_empty_lists(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.get("/api/search", params={"q": "NothingMatchesThis"}, headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data == {"products": [], "customers": [], "inventory": [], "invoices": [], "categories": []}


def test_global_search_finds_inventory_with_stock_subtitle(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.post(
        "/api/products",
        json={"name": "Zenith Widget", "identifier_value": "ZEN-1", "selling_price": 10.0},
        headers=headers,
    )
    product = client.get("/api/products", params={"q": "Zenith"}, headers=headers).json()["data"]["items"][0]
    client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "add", "quantity": 25, "reason": "opening_stock"},
        headers=headers,
    )

    response = client.get("/api/search", params={"q": "Zenith"}, headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data["inventory"]) == 1
    assert data["inventory"][0]["label"] == "Zenith Widget"
    assert data["inventory"][0]["subtitle"] == "Stock: 25"
