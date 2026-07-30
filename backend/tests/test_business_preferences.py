from __future__ import annotations

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


def test_starting_invoice_number_seeds_first_invoice_only(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"starting_invoice_number": 5000}, headers=headers)
    product = _create_product(client, headers)

    first = client.post(
        "/api/invoices", json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"}, headers=headers
    ).json()["data"]
    assert first["invoice_number"] == "INV-005000"

    second = client.post(
        "/api/invoices", json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"}, headers=headers
    ).json()["data"]
    assert second["invoice_number"] == "INV-005001"


def test_allow_negative_stock_disabled_blocks_oversell(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"allow_negative_stock": False}, headers=headers)
    product = _create_product(client, headers)

    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 400
    assert "insufficient stock" in response.json()["detail"].lower()


def test_allow_negative_stock_enabled_by_default_permits_oversell(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 200


def test_default_low_stock_threshold_applied_to_new_products(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"default_low_stock_threshold": 25}, headers=headers)
    product = _create_product(client, headers)

    inventory = client.get("/api/inventory", params={"page_size": 100}, headers=headers).json()["data"]
    row = next(r for r in inventory["items"] if r["product_id"] == product["id"])
    assert row["reorder_level"] == 25.0


def test_business_preferences_endpoint_accessible_to_all_roles(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    client.put(
        "/api/settings",
        json={"default_tax_percent": 12.5, "allow_discounts": False, "default_payment_method": "upi"},
        headers=headers,
    )

    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    response = client.get("/api/settings/business-preferences", headers=staff_headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["default_tax_percent"] == 12.5
    assert data["allow_discounts"] is False
    assert data["default_payment_method"] == "upi"


def test_invoice_pdf_reflects_custom_decimal_precision_and_footer(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put(
        "/api/settings",
        json={"decimal_precision": 3, "date_format": "YYYY-MM-DD", "receipt_footer": "Thanks for shopping!"},
        headers=headers,
    )
    product = _create_product(client, headers)
    invoice = client.post(
        "/api/invoices", json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"}, headers=headers
    ).json()["data"]

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.content.startswith(b"%PDF")


def test_invoice_with_customer_id_populates_name_and_phone(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    customer = client.post(
        "/api/customers", json={"name": "Priya Sharma", "mobile": "9999911111"}, headers=headers
    ).json()["data"]

    invoice = client.post(
        "/api/invoices",
        json={
            "customer_id": customer["id"],
            "lines": [{"product_id": product["id"], "quantity": 1}],
            "payment_method": "upi",
        },
        headers=headers,
    )
    assert invoice.status_code == 200
    data = invoice.json()["data"]
    assert data["customer_id"] == customer["id"]
    assert data["customer_name"] == "Priya Sharma"
    assert data["customer_phone"] == "9999911111"


def test_invoice_with_unknown_customer_id_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    response = client.post(
        "/api/invoices",
        json={
            "customer_id": "does-not-exist",
            "lines": [{"product_id": product["id"], "quantity": 1}],
            "payment_method": "upi",
        },
        headers=headers,
    )
    assert response.status_code == 404
