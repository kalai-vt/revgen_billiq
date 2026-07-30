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


def _enable_procurement(client: TestClient, admin_db_session: Session, owner: dict) -> None:
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")


def _create_product(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Widget", "identifier_value": "WID-1", "cost_price": 5.0, "selling_price": 20.0, "tax_rate_percent": 0.0}
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _create_vendor(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Global Supplies Co"}
    payload.update(overrides)
    response = client.post("/api/procurement/vendors", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _create_purchase(client: TestClient, headers: dict, vendor_id: str, product_id: str, quantity: float = 10, unit_cost: float = 4.0) -> dict:
    response = client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor_id,
            "purchase_date": "2026-01-01",
            "items": [{"product_id": product_id, "quantity": quantity, "unit_cost_price": unit_cost}],
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_vendor_payment_auto_allocates_and_updates_outstanding(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    purchase = _create_purchase(client, headers, vendor["id"], product["id"], quantity=10, unit_cost=4.0)  # total 40

    payment = client.post(
        "/api/procurement/vendor-payments",
        json={"vendor_id": vendor["id"], "amount": 25.0, "payment_method": "bank_transfer"},
        headers=headers,
    )
    assert payment.status_code == 200, payment.text
    data = payment.json()["data"]
    assert data["payment_number"].startswith("VP-")
    assert data["allocations"][0]["purchase_entry_id"] == purchase["id"]
    assert data["allocations"][0]["amount"] == 25.0

    purchase_after = client.get(f"/api/procurement/purchases/{purchase['id']}", headers=headers).json()["data"]
    assert purchase_after["paid_amount"] == 25.0
    assert purchase_after["outstanding_amount"] == 15.0
    assert purchase_after["payment_status"] == "partial"

    vendor_after = client.get(f"/api/procurement/vendors/{vendor['id']}", headers=headers).json()["data"]
    assert vendor_after["outstanding_amount"] == 15.0


def test_vendor_payment_full_settlement_marks_purchase_paid(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    purchase = _create_purchase(client, headers, vendor["id"], product["id"], quantity=10, unit_cost=4.0)

    client.post(
        "/api/procurement/vendor-payments",
        json={"vendor_id": vendor["id"], "amount": 40.0, "payment_method": "cash"},
        headers=headers,
    )

    purchase_after = client.get(f"/api/procurement/purchases/{purchase['id']}", headers=headers).json()["data"]
    assert purchase_after["payment_status"] == "paid"
    assert purchase_after["outstanding_amount"] == 0.0


def test_vendor_payment_exceeding_outstanding_rejected(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    _create_purchase(client, headers, vendor["id"], product["id"], quantity=10, unit_cost=4.0)

    response = client.post(
        "/api/procurement/vendor-payments",
        json={"vendor_id": vendor["id"], "amount": 100.0, "payment_method": "cash"},
        headers=headers,
    )
    assert response.status_code == 400


def test_vendor_ledger_reflects_purchase_and_payment(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    _create_purchase(client, headers, vendor["id"], product["id"], quantity=10, unit_cost=4.0)
    client.post(
        "/api/procurement/vendor-payments",
        json={"vendor_id": vendor["id"], "amount": 15.0, "payment_method": "cash"},
        headers=headers,
    )

    ledger = client.get(f"/api/procurement/vendors/{vendor['id']}/ledger", headers=headers)
    assert ledger.status_code == 200
    data = ledger.json()["data"]
    assert data["closing_balance"] == 25.0
    types = [e["type"] for e in data["entries"]]
    assert "purchase" in types
    assert "payment" in types


def test_staff_cannot_create_vendor_payment(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    _create_purchase(client, headers, vendor["id"], product["id"])

    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    response = client.post(
        "/api/procurement/vendor-payments",
        json={"vendor_id": vendor["id"], "amount": 10.0, "payment_method": "cash"},
        headers=staff_headers,
    )
    assert response.status_code == 403
