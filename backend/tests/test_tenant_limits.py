from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone


def _admin_headers(client: TestClient, admin_db_session: Session, role: str = "super_admin") -> dict:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email="owner@revgeniq.com",
        password_hash=hash_password("AdminPass!123"), role=role, status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    return {"Authorization": f"Bearer {login.json()['data']['access_token']}"}


def _register_tenant(client: TestClient) -> dict:
    return register_and_activate_standalone(
        client,
        {
            "company_name": "Acme Retail",
            "legal_name": "Acme Retail Ltd",
            "email": "owner@acme.test",
            "phone": "+15551234567",
            "password": "StrongPass!123",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "country": "US",
            "currency": "USD",
            "timezone": "UTC",
        },
    )


def _by_key(limits: list[dict]) -> dict[str, dict]:
    return {row["limit_key"]: row for row in limits}


def test_default_limits_match_plan(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.get(f"/api/admin/customers/{tenant_id}/limits", headers=headers)
    assert response.status_code == 200, response.text
    limits = _by_key(response.json()["data"]["limits"])
    assert limits["max_customers"]["effective_value"] == 500
    assert limits["max_customers"]["plan_default"] == 500
    assert limits["max_customers"]["is_overridden"] is False


def test_override_beats_plan_default(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]
    token = owner["access_token"]

    override = client.put(
        f"/api/admin/customers/{tenant_id}/limits",
        json={"overrides": [{"limit_key": "max_customers", "limit_value": 2}]},
        headers=headers,
    )
    assert override.status_code == 200, override.text
    limits = _by_key(override.json()["data"]["limits"])
    assert limits["max_customers"]["effective_value"] == 2
    assert limits["max_customers"]["is_overridden"] is True

    tenant_headers = {"Authorization": f"Bearer {token}"}
    client.post("/api/customers", json={"name": "A"}, headers=tenant_headers)
    client.post("/api/customers", json={"name": "B"}, headers=tenant_headers)
    blocked = client.post("/api/customers", json={"name": "C"}, headers=tenant_headers)
    assert blocked.status_code == 402


def test_override_unlimited_with_null_value(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.put(
        f"/api/admin/customers/{tenant_id}/limits",
        json={"overrides": [{"limit_key": "max_products", "limit_value": None}]},
        headers=headers,
    )
    limits = _by_key(response.json()["data"]["limits"])
    assert limits["max_products"]["effective_value"] is None
    assert limits["max_products"]["is_overridden"] is True


def test_reset_override_falls_back_to_plan_default(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    client.put(
        f"/api/admin/customers/{tenant_id}/limits",
        json={"overrides": [{"limit_key": "max_customers", "limit_value": 2}]},
        headers=headers,
    )
    reset = client.put(
        f"/api/admin/customers/{tenant_id}/limits",
        json={"overrides": [{"limit_key": "max_customers", "reset": True}]},
        headers=headers,
    )
    limits = _by_key(reset.json()["data"]["limits"])
    assert limits["max_customers"]["effective_value"] == 500
    assert limits["max_customers"]["is_overridden"] is False


def test_set_limits_requires_billing_role(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session, role="support")
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.put(
        f"/api/admin/customers/{tenant_id}/limits",
        json={"overrides": [{"limit_key": "max_customers", "limit_value": 2}]},
        headers=headers,
    )
    assert response.status_code == 403


def test_unknown_limit_key_rejected(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.put(
        f"/api/admin/customers/{tenant_id}/limits",
        json={"overrides": [{"limit_key": "max_unicorns", "limit_value": 2}]},
        headers=headers,
    )
    assert response.status_code == 400
