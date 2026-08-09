from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import register_and_activate_standalone, set_tenant_plan


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


def _create_category(client: TestClient, headers: dict, name: str = "Widgets") -> dict:
    response = client.post("/api/categories", json={"name": name}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _create_product(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "Widget",
        "identifier_value": "WID-1",
        "cost_price": 5.0,
        "selling_price": 100.0,
        "tax_rate_percent": 0.0,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _create_invoice(client: TestClient, headers: dict, product: dict, quantity: float = 1) -> dict:
    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": quantity}], "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _return_full_invoice(client: TestClient, headers: dict, invoice: dict) -> dict:
    lines = [{"invoice_item_id": item["id"], "quantity": item["quantity"]} for item in invoice["items"]]
    response = client.post(f"/api/invoices/{invoice['id']}/returns", json={"lines": lines, "reason": "other"}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _dashboard(client: TestClient, headers: dict) -> dict:
    today = date.today()
    response = client.get(
        "/api/analytics/dashboard",
        params={"date_from": str(today - timedelta(days=1)), "date_to": str(today + timedelta(days=1))},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_full_return_zeroes_out_net_sales_but_not_gross(client: TestClient) -> None:
    """The exact scenario reported: a ₹1000 bill, fully returned, must not still show as ₹1000 of
    revenue on the dashboard — total_sales (gross) keeps the original figure, net_sales (what the
    frontend now labels "Revenue") reflects the return."""
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=1000.0)
    invoice = _create_invoice(client, headers, product, quantity=1)
    assert invoice["total_amount"] == 1000.0

    _return_full_invoice(client, headers, invoice)

    kpis = _dashboard(client, headers)["kpis"]
    assert kpis["total_sales"] == 1000.0
    assert kpis["returned_amount"] == 1000.0
    assert kpis["net_sales"] == 0.0


def test_partial_return_reduces_net_sales_proportionally(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    invoice = _create_invoice(client, headers, product, quantity=4)
    assert invoice["total_amount"] == 400.0

    item_id = invoice["items"][0]["id"]
    client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}], "reason": "other"},
        headers=headers,
    )

    kpis = _dashboard(client, headers)["kpis"]
    assert kpis["total_sales"] == 400.0
    assert kpis["returned_amount"] == 100.0
    assert kpis["net_sales"] == 300.0


def test_sales_trend_nets_out_returns(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=500.0)
    invoice = _create_invoice(client, headers, product, quantity=1)
    _return_full_invoice(client, headers, invoice)

    data = _dashboard(client, headers)
    today_points = [p for p in data["sales_trend"] if p["bucket_start"] == str(date.today())]
    assert len(today_points) == 1
    assert today_points[0]["revenue"] == 0.0


def test_top_products_and_categories_net_out_returns(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    category = _create_category(client, headers)
    product = _create_product(client, headers, selling_price=200.0, category_id=category["id"])
    invoice = _create_invoice(client, headers, product, quantity=2)
    item_id = invoice["items"][0]["id"]
    client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}], "reason": "other"},
        headers=headers,
    )

    data = _dashboard(client, headers)
    top_product = next(p for p in data["top_products"] if p["product_id"] == product["id"])
    assert top_product["qty_sold"] == 1.0
    assert top_product["revenue"] == 200.0

    top_category = next(c for c in data["top_categories"] if c["category_id"] == category["id"])
    assert top_category["qty_sold"] == 1.0
    assert top_category["revenue"] == 200.0


def test_sales_by_employee_attributes_return_to_original_seller(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=300.0)
    invoice = _create_invoice(client, headers, product, quantity=1)
    _return_full_invoice(client, headers, invoice)

    data = _dashboard(client, headers)
    employee_row = next(e for e in data["sales_by_employee"] if e["user_id"] == owner["user"]["id"])
    assert employee_row["revenue"] == 0.0


def test_payment_methods_net_out_returns(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=250.0)
    invoice = _create_invoice(client, headers, product, quantity=1)
    assert invoice["payment_method"] == "upi"
    _return_full_invoice(client, headers, invoice)

    data = _dashboard(client, headers)
    upi_row = next(m for m in data["payment_methods"] if m["method"] == "upi")
    assert upi_row["amount"] == 0.0


def test_trend_comparison_revenue_uses_net_sales(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=600.0)
    invoice = _create_invoice(client, headers, product, quantity=1)
    _return_full_invoice(client, headers, invoice)

    response = client.get("/api/analytics/trend-comparison", params={"unit": "day"}, headers=headers)
    assert response.status_code == 200, response.text
    metrics = {m["key"]: m for m in response.json()["data"]["metrics"]}
    assert metrics["revenue"]["current_value"] == 0.0
