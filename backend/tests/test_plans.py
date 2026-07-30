from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core import plans as plans_module
from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
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


def _admin_headers(client: TestClient, admin_db_session: Session) -> dict:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email="owner@revgeniq.com",
        password_hash=hash_password("AdminPass!123"), role="super_admin", status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    return {"Authorization": f"Bearer {login.json()['data']['access_token']}"}


def _set_plan(client: TestClient, admin_db_session: Session, tenant_id: str, plan: str) -> None:
    """Plan assignment is Super-Admin-only (tenants can no longer self-upgrade via
    `PUT /api/settings` — see `test_plan_field_ignored_via_settings_update` below), so tests that
    need a tenant on a specific plan go through the same admin endpoint a real Super Admin uses."""
    headers = _admin_headers(client, admin_db_session)
    response = client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": plan}, headers=headers)
    assert response.status_code == 200, response.text


def test_product_limit_enforced(client: TestClient, monkeypatch) -> None:
    monkeypatch.setitem(plans_module.PLANS["basic"], "max_products", 1)
    owner = _register(client)
    headers = _headers(owner["access_token"])

    first = client.post("/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers)
    assert first.status_code == 200

    second = client.post("/api/products", json={"name": "BB", "identifier_value": "B-1", "selling_price": 10}, headers=headers)
    assert second.status_code == 402


def test_customer_limit_enforced(client: TestClient, monkeypatch) -> None:
    monkeypatch.setitem(plans_module.PLANS["basic"], "max_customers", 1)
    owner = _register(client)
    headers = _headers(owner["access_token"])

    first = client.post("/api/customers", json={"name": "A"}, headers=headers)
    assert first.status_code == 200

    second = client.post("/api/customers", json={"name": "B"}, headers=headers)
    assert second.status_code == 402


def test_team_member_blocked_on_basic_then_allowed_on_explore(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    denied = client.post(
        "/api/auth/team",
        json={"first_name": "S", "last_name": "T", "email": "s@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    assert denied.status_code == 402

    _set_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    allowed = client.post(
        "/api/auth/team",
        json={"first_name": "S", "last_name": "T", "email": "s2@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    assert allowed.status_code == 200


def test_monthly_invoice_limit_enforced(client: TestClient, monkeypatch) -> None:
    monkeypatch.setitem(plans_module.PLANS["basic"], "max_monthly_invoices", 1)
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = client.post(
        "/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers
    ).json()["data"]

    first = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "card"},
        headers=headers,
    )
    assert first.status_code == 200

    second = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "card"},
        headers=headers,
    )
    assert second.status_code == 402


def test_barcode_available_on_basic_plan(client: TestClient) -> None:
    # Barcode Printing is one of Basic's included modules per the current plan matrix.
    owner = _register(client)
    headers = _headers(owner["access_token"])

    allowed = client.post(
        "/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10, "barcode": "123"}, headers=headers
    )
    assert allowed.status_code == 200


def test_barcode_requires_barcode_support_feature(client: TestClient, monkeypatch) -> None:
    monkeypatch.setitem(plans_module.PLANS["basic"]["features"], "barcode_support", False)
    owner = _register(client)
    headers = _headers(owner["access_token"])

    denied = client.post(
        "/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10, "barcode": "123"}, headers=headers
    )
    assert denied.status_code == 402


def test_advanced_analytics_requires_explore_plan(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    basic_dashboard = client.get("/api/analytics/dashboard?days=7", headers=headers)
    assert basic_dashboard.status_code == 200

    denied = client.get("/api/analytics/dashboard?days=14&advanced=true", headers=headers)
    assert denied.status_code == 402

    _set_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    allowed = client.get("/api/analytics/dashboard?days=14&advanced=true", headers=headers)
    assert allowed.status_code == 200


def test_gst_number_snapshotted_on_invoice(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"gst_number": "29ABCDE1234F1Z5"}, headers=headers)

    product = client.post(
        "/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers
    ).json()["data"]
    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "card"},
        headers=headers,
    ).json()["data"]
    assert invoice["gst_number"] == "29ABCDE1234F1Z5"

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"


def test_usage_endpoint_reports_plan_and_counts(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.post("/api/products", json={"name": "AA", "identifier_value": "A-1", "selling_price": 10}, headers=headers)

    usage = client.get("/api/billing/usage", headers=headers)
    assert usage.status_code == 200
    data = usage.json()["data"]
    assert data["plan"] == "basic"
    assert data["usage"]["products"]["used"] == 1
    assert data["usage"]["products"]["limit"] == 500
    assert data["features"]["barcode_support"] is True
    assert data["usage"]["branches"] == {"used": 1, "limit": 1}
    assert data["usage"]["warehouses"] == {"used": 1, "limit": 1}
    # No avatar/logo uploaded in this test, so storage usage is a real (zero) number, not null.
    assert data["usage"]["storage"] == {"used": 0.0, "limit": 1024}
    assert data["subscription_status"] == "active"
    assert "billing_cycle" in data
