from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import PriceOverrideAudit
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


def _create_team_member(client: TestClient, owner_headers: dict, role: str, email: str) -> dict:
    client.put("/api/settings", json={"plan": "explore"}, headers=owner_headers)
    response = client.post(
        "/api/auth/team",
        json={
            "first_name": "Sam",
            "last_name": role.title(),
            "email": email,
            "password": "TeamPass!123",
            "role": role,
        },
        headers=owner_headers,
    )
    assert response.status_code == 200
    login = client.post("/api/auth/login", json={"email": email, "password": "TeamPass!123"})
    return login.json()["data"]


def test_owner_can_override_price_and_audit_row_is_written(client: TestClient, db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=20.0)

    response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 2, "unit_price": 15.0}],
            "payment_method": "upi",
        },
        headers=headers,
    )
    assert response.status_code == 200
    invoice = response.json()["data"]
    assert invoice["subtotal"] == 30.0
    assert invoice["items"][0]["unit_price"] == 15.0

    audits = db_session.query(PriceOverrideAudit).filter(PriceOverrideAudit.invoice_id == invoice["id"]).all()
    assert len(audits) == 1
    audit = audits[0]
    assert audit.product_id == product["id"]
    assert audit.original_price == 20.0
    assert audit.new_price == 15.0
    assert audit.tenant_id == owner["tenant"]["id"]
    assert audit.user_id == owner["user"]["id"]
    assert audit.created_at is not None


def test_manager_blocked_by_default(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    product = _create_product(client, owner_headers)
    manager = _create_team_member(client, owner_headers, "manager", "manager@acme.test")
    manager_headers = _headers(manager["access_token"])

    response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1, "unit_price": 10.0}],
            "payment_method": "upi",
        },
        headers=manager_headers,
    )
    assert response.status_code == 403


def test_manager_allowed_after_settings_toggle(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    product = _create_product(client, owner_headers)
    manager = _create_team_member(client, owner_headers, "manager", "manager2@acme.test")
    manager_headers = _headers(manager["access_token"])

    toggle = client.put("/api/settings", json={"allow_manager_price_override": True}, headers=owner_headers)
    assert toggle.status_code == 200
    assert toggle.json()["data"]["allow_manager_price_override"] is True

    response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1, "unit_price": 10.0}],
            "payment_method": "upi",
        },
        headers=manager_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["items"][0]["unit_price"] == 10.0


def test_staff_always_blocked_regardless_of_setting(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    product = _create_product(client, owner_headers)
    client.put("/api/settings", json={"allow_manager_price_override": True}, headers=owner_headers)
    staff = _create_team_member(client, owner_headers, "staff", "staff@acme.test")
    staff_headers = _headers(staff["access_token"])

    response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1, "unit_price": 10.0}],
            "payment_method": "upi",
        },
        headers=staff_headers,
    )
    assert response.status_code == 403


def test_normal_checkout_without_unit_price_is_unaffected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=20.0)

    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["items"][0]["unit_price"] == 20.0


def test_me_reports_can_override_price_per_role(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    assert client.get("/api/auth/me", headers=owner_headers).json()["data"]["can_override_price"] is True

    manager = _create_team_member(client, owner_headers, "manager", "manager3@acme.test")
    manager_headers = _headers(manager["access_token"])
    assert client.get("/api/auth/me", headers=manager_headers).json()["data"]["can_override_price"] is False

    client.put("/api/settings", json={"allow_manager_price_override": True}, headers=owner_headers)
    assert client.get("/api/auth/me", headers=manager_headers).json()["data"]["can_override_price"] is True

    staff = _create_team_member(client, owner_headers, "staff", "staff2@acme.test")
    staff_headers = _headers(staff["access_token"])
    assert client.get("/api/auth/me", headers=staff_headers).json()["data"]["can_override_price"] is False
