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


def _inventory_row(client: TestClient, headers: dict, product_id: str) -> dict:
    response = client.get("/api/inventory", params={"page_size": 100}, headers=headers)
    return next(r for r in response.json()["data"]["items"] if r["product_id"] == product_id)


def test_purchase_return_decreases_stock_and_reduces_outstanding(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    purchase = _create_purchase(client, headers, vendor["id"], product["id"], quantity=10, unit_cost=4.0)

    item_id = purchase["items"][0]["id"]
    response = client.post(
        "/api/procurement/returns",
        json={
            "purchase_entry_id": purchase["id"],
            "reason": "Damaged in transit",
            "lines": [{"purchase_entry_item_id": item_id, "quantity": 3, "reason": "damaged"}],
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["refund_amount"] == 12.0  # 3 units * 4.0
    assert data["return_number"].startswith("PR-")
    assert data["status"] == "completed"

    inv = _inventory_row(client, headers, product["id"])
    assert inv["quantity"] == 7.0  # 10 - 3

    purchase_after = client.get(f"/api/procurement/purchases/{purchase['id']}", headers=headers).json()["data"]
    assert purchase_after["outstanding_amount"] == 28.0  # 40 - 12

    vendor_after = client.get(f"/api/procurement/vendors/{vendor['id']}", headers=headers).json()["data"]
    assert vendor_after["outstanding_amount"] == 28.0


def test_purchase_return_cannot_exceed_remaining_quantity(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    purchase = _create_purchase(client, headers, vendor["id"], product["id"], quantity=5, unit_cost=4.0)
    item_id = purchase["items"][0]["id"]

    response = client.post(
        "/api/procurement/returns",
        json={"purchase_entry_id": purchase["id"], "lines": [{"purchase_entry_item_id": item_id, "quantity": 10}]},
        headers=headers,
    )
    assert response.status_code == 400


def test_cancel_purchase_return_reverses_stock_and_outstanding(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    purchase = _create_purchase(client, headers, vendor["id"], product["id"], quantity=10, unit_cost=4.0)
    item_id = purchase["items"][0]["id"]

    ret = client.post(
        "/api/procurement/returns",
        json={"purchase_entry_id": purchase["id"], "lines": [{"purchase_entry_item_id": item_id, "quantity": 3}]},
        headers=headers,
    ).json()["data"]

    cancel = client.post(f"/api/procurement/returns/{ret['id']}/cancel", json={"reason": "Mistake"}, headers=headers)
    assert cancel.status_code == 200
    assert cancel.json()["data"]["status"] == "cancelled"

    inv = _inventory_row(client, headers, product["id"])
    assert inv["quantity"] == 10.0

    purchase_after = client.get(f"/api/procurement/purchases/{purchase['id']}", headers=headers).json()["data"]
    assert purchase_after["outstanding_amount"] == 40.0


def test_staff_cannot_create_return(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    purchase = _create_purchase(client, headers, vendor["id"], product["id"])
    item_id = purchase["items"][0]["id"]

    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    response = client.post(
        "/api/procurement/returns",
        json={"purchase_entry_id": purchase["id"], "lines": [{"purchase_entry_item_id": item_id, "quantity": 1}]},
        headers=staff_headers,
    )
    assert response.status_code == 403
