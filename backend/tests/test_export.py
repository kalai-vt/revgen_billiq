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
        "tax_rate_percent": 18.0,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _create_customer(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Jane Doe", "mobile": "9998887777"}
    payload.update(overrides)
    response = client.post("/api/customers", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _create_invoice(client: TestClient, headers: dict, product_id: str) -> dict:
    payload = {
        "lines": [{"product_id": product_id, "quantity": 1}],
        "payment_method": "cash",
        "amount_tendered": 100,
    }
    response = client.post("/api/invoices", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


CONTENT_TYPES = {
    "excel": "spreadsheetml",
    "pdf": "application/pdf",
    "csv": "text/csv",
}


def test_products_export_all_formats(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers)

    for fmt, expected_type in CONTENT_TYPES.items():
        response = client.get(f"/api/products/export?format={fmt}", headers=headers)
        assert response.status_code == 200
        assert expected_type in response.headers["content-type"]
        assert len(response.content) > 0


def test_customers_export_all_formats(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_customer(client, headers)

    for fmt, expected_type in CONTENT_TYPES.items():
        response = client.get(f"/api/customers/export?format={fmt}", headers=headers)
        assert response.status_code == 200
        assert expected_type in response.headers["content-type"]
        assert len(response.content) > 0


def test_invoices_export_all_formats(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    _create_invoice(client, headers, product["id"])

    for fmt, expected_type in CONTENT_TYPES.items():
        response = client.get(f"/api/invoices/export?format={fmt}", headers=headers)
        assert response.status_code == 200
        assert expected_type in response.headers["content-type"]
        assert len(response.content) > 0


def test_inventory_export_csv_format(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers)

    response = client.get("/api/inventory/export?format=csv", headers=headers)
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert b"Widget" in response.content


def test_export_rejects_invalid_format(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.get("/api/products/export?format=xml", headers=headers)
    assert response.status_code == 422


def test_export_respects_filters(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, name="Alpha", identifier_value="A-1")
    _create_product(client, headers, name="Beta", identifier_value="B-1")

    response = client.get("/api/products/export?format=csv&q=Alpha", headers=headers)
    assert response.status_code == 200
    assert b"Alpha" in response.content
    assert b"Beta" not in response.content
