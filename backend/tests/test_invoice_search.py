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


def _create_invoice(client: TestClient, headers: dict, product: dict, **overrides) -> dict:
    payload = {
        "lines": [{"product_id": product["id"], "quantity": 1}],
        "payment_method": "upi",
    }
    payload.update(overrides)
    response = client.post("/api/invoices", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def test_search_by_customer_name_and_phone(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    _create_invoice(client, headers, product, customer_name="Priya Sharma", customer_phone="9999911111")
    _create_invoice(client, headers, product, customer_name="Rahul Verma", customer_phone="9999922222")

    by_name = client.get("/api/invoices", params={"q": "Priya"}, headers=headers).json()["data"]
    assert by_name["total"] == 1
    assert by_name["items"][0]["customer_name"] == "Priya Sharma"

    by_phone = client.get("/api/invoices", params={"q": "9999922222"}, headers=headers).json()["data"]
    assert by_phone["total"] == 1
    assert by_phone["items"][0]["customer_name"] == "Rahul Verma"


def test_search_by_product_name_and_identifier(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    widget = _create_product(client, headers, name="Blue Widget", identifier_value="BLU-1")
    gadget = _create_product(client, headers, name="Red Gadget", identifier_value="RED-9")
    _create_invoice(client, headers, widget)
    _create_invoice(client, headers, gadget)

    by_product_name = client.get("/api/invoices", params={"q": "Gadget"}, headers=headers).json()["data"]
    assert by_product_name["total"] == 1

    by_identifier = client.get("/api/invoices", params={"q": "BLU-1"}, headers=headers).json()["data"]
    assert by_identifier["total"] == 1


def test_search_by_invoice_number(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product)

    response = client.get("/api/invoices", params={"q": invoice["invoice_number"]}, headers=headers).json()["data"]
    assert response["total"] == 1


def test_filter_by_status(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    paid_invoice = _create_invoice(client, headers, product)
    to_cancel = _create_invoice(client, headers, product)
    client.post(f"/api/invoices/{to_cancel['id']}/void", headers=headers)

    paid = client.get("/api/invoices", params={"status": "paid"}, headers=headers).json()["data"]
    assert paid["total"] == 1
    assert paid["items"][0]["id"] == paid_invoice["id"]

    cancelled = client.get("/api/invoices", params={"status": "cancelled"}, headers=headers).json()["data"]
    assert cancelled["total"] == 1
    assert cancelled["items"][0]["id"] == to_cancel["id"]


def test_sort_by_total_amount(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    cheap = _create_product(client, headers, name="Cheap", identifier_value="CHEAP-1", selling_price=5.0)
    pricey = _create_product(client, headers, name="Pricey", identifier_value="PRICEY-1", selling_price=500.0)
    _create_invoice(client, headers, cheap)
    _create_invoice(client, headers, pricey)

    ascending = client.get(
        "/api/invoices", params={"sort_by": "total_amount", "sort_dir": "asc"}, headers=headers
    ).json()["data"]
    assert ascending["items"][0]["total_amount"] == 5.0
    assert ascending["items"][1]["total_amount"] == 500.0

    descending = client.get(
        "/api/invoices", params={"sort_by": "total_amount", "sort_dir": "desc"}, headers=headers
    ).json()["data"]
    assert descending["items"][0]["total_amount"] == 500.0


def test_date_range_filter_excludes_out_of_range(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    _create_invoice(client, headers, product)

    far_future = client.get(
        "/api/invoices", params={"date_from": "2999-01-01", "date_to": "2999-12-31"}, headers=headers
    ).json()["data"]
    assert far_future["total"] == 0

    far_past = client.get(
        "/api/invoices", params={"date_from": "1999-01-01", "date_to": "2999-12-31"}, headers=headers
    ).json()["data"]
    assert far_past["total"] == 1
