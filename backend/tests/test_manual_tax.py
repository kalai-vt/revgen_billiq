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
        "selling_price": 1000.0,
        "tax_rate_percent": 0.0,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def test_worked_example_matches_spec(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=1000.0)

    response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1}],
            "discount_type": "flat",
            "discount_value": 100,
            "tax_percentage": 18,
            "payment_method": "upi",
        },
        headers=headers,
    )
    assert response.status_code == 200
    invoice = response.json()["data"]

    assert invoice["subtotal"] == 1000.0
    assert invoice["discount_amount"] == 100.0
    assert invoice["taxable_amount"] == 900.0
    assert invoice["tax_percentage"] == 18
    assert invoice["tax_amount"] == 162.0
    assert invoice["total_amount"] == 1062.0


def test_tax_percentage_zero(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=200.0)

    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "tax_percentage": 0, "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 200
    invoice = response.json()["data"]
    assert invoice["tax_amount"] == 0.0
    assert invoice["total_amount"] == 200.0


def test_tax_percentage_hundred(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=50.0)

    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "tax_percentage": 100, "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 200
    invoice = response.json()["data"]
    assert invoice["tax_amount"] == 50.0
    assert invoice["total_amount"] == 100.0


def test_tax_percentage_below_zero_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "tax_percentage": -5, "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 422


def test_tax_percentage_above_hundred_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "tax_percentage": 150, "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 422


def test_tax_percentage_omitted_defaults_to_zero(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=75.0)

    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 200
    invoice = response.json()["data"]
    assert invoice["tax_percentage"] == 0
    assert invoice["tax_amount"] == 0.0
    assert invoice["total_amount"] == 75.0


def test_invoice_retains_tax_percentage_even_if_product_tax_rate_changes_later(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0, tax_rate_percent=5.0)

    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "tax_percentage": 12, "payment_method": "upi"},
        headers=headers,
    ).json()["data"]
    assert invoice["tax_percentage"] == 12
    assert invoice["tax_amount"] == 12.0

    client.put(f"/api/products/{product['id']}", json={"tax_rate_percent": 25.0}, headers=headers)

    fetched = client.get(f"/api/invoices/{invoice['id']}", headers=headers).json()["data"]
    assert fetched["tax_percentage"] == 12
    assert fetched["tax_amount"] == 12.0
