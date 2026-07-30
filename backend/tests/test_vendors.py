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


def _create_vendor(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Global Supplies Co", "phone": "9998887777"}
    payload.update(overrides)
    response = client.post("/api/procurement/vendors", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_vendor_endpoints_blocked_when_feature_disabled(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    response = client.get("/api/procurement/vendors", headers=headers)
    assert response.status_code == 402


def test_vendor_crud_lifecycle(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)

    vendor = _create_vendor(client, headers, name="Fresh Farms", email="fresh@farms.test")
    assert vendor["name"] == "Fresh Farms"
    assert vendor["is_active"] is True
    assert vendor["outstanding_amount"] == 0.0

    update = client.put(f"/api/procurement/vendors/{vendor['id']}", json={"credit_limit": 5000}, headers=headers)
    assert update.status_code == 200
    assert update.json()["data"]["credit_limit"] == 5000.0

    listing = client.get("/api/procurement/vendors", headers=headers)
    assert listing.status_code == 200
    assert listing.json()["data"]["total"] == 1

    detail = client.get(f"/api/procurement/vendors/{vendor['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["data"]["id"] == vendor["id"]

    delete = client.delete(f"/api/procurement/vendors/{vendor['id']}", headers=headers)
    assert delete.status_code == 200

    listing_after = client.get("/api/procurement/vendors", headers=headers)
    assert listing_after.json()["data"]["total"] == 0


def test_vendor_search_and_filter(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)

    _create_vendor(client, headers, name="Alpha Traders", phone="1111111111")
    beta = _create_vendor(client, headers, name="Beta Distributors", phone="2222222222")
    client.put(f"/api/procurement/vendors/{beta['id']}", json={"is_active": False}, headers=headers)

    search = client.get("/api/procurement/vendors", params={"q": "Alpha"}, headers=headers)
    assert search.json()["data"]["total"] == 1
    assert search.json()["data"]["items"][0]["name"] == "Alpha Traders"

    active_only = client.get("/api/procurement/vendors", params={"is_active": True}, headers=headers)
    assert active_only.json()["data"]["total"] == 1

    inactive_only = client.get("/api/procurement/vendors", params={"is_active": False}, headers=headers)
    assert inactive_only.json()["data"]["total"] == 1
    assert inactive_only.json()["data"]["items"][0]["name"] == "Beta Distributors"


def test_vendor_with_purchase_history_cannot_be_deleted(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)

    product = client.post(
        "/api/products",
        json={"name": "Widget", "identifier_value": "WID-1", "cost_price": 5.0, "selling_price": 20.0, "tax_rate_percent": 0.0},
        headers=headers,
    ).json()["data"]

    client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": "2026-01-01",
            "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}],
        },
        headers=headers,
    )

    delete = client.delete(f"/api/procurement/vendors/{vendor['id']}", headers=headers)
    assert delete.status_code == 400


def test_staff_cannot_create_vendor_but_can_read(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)

    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    response = client.post("/api/procurement/vendors", json={"name": "Blocked Vendor"}, headers=staff_headers)
    assert response.status_code == 403

    read = client.get("/api/procurement/vendors", headers=staff_headers)
    assert read.status_code == 200


def test_non_owner_cannot_delete_vendor(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, admin_db_session, owner)
    vendor = _create_vendor(client, headers)

    client.post(
        "/api/auth/team",
        json={"first_name": "Mia", "last_name": "Manager", "email": "manager@acme.test", "password": "ManagerPass!123", "role": "manager"},
        headers=headers,
    )
    manager_login = client.post("/api/auth/login", json={"email": "manager@acme.test", "password": "ManagerPass!123"})
    manager_headers = _headers(manager_login.json()["data"]["access_token"])

    response = client.delete(f"/api/procurement/vendors/{vendor['id']}", headers=manager_headers)
    assert response.status_code == 403
