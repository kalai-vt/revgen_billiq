from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone


def _seed_admin(admin_db_session: Session, email: str = "owner@revgeniq.com", role: str = "super_admin") -> AdminUser:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email=email, password_hash=hash_password("AdminPass!123"), role=role, status="active"
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    admin_db_session.refresh(admin)
    return admin


def _admin_headers(client: TestClient, admin_db_session: Session, role: str = "super_admin") -> dict:
    _seed_admin(admin_db_session, role=role)
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    return {"Authorization": f"Bearer {login.json()['data']['access_token']}"}


def _register_tenant(client: TestClient, email: str = "owner@acme.test") -> dict:
    return register_and_activate_standalone(
        client,
        {
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
        },
    )


def test_list_subscriptions_includes_registered_tenant(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    _register_tenant(client)

    response = client.get("/api/admin/subscriptions", headers=headers)
    assert response.status_code == 200, response.text
    companies = [row["company_name"] for row in response.json()["data"]]
    assert "Acme Retail" in companies


def test_upgrade_plan_writes_history_event(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.put(
        f"/api/admin/customers/{tenant_id}/subscription",
        json={"plan": "advance", "note": "Upgraded during onboarding call"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["plan"] == "advance"
    assert data["history"][0]["event_type"] == "upgrade"
    assert data["history"][0]["to_plan"] == "advance"


def test_downgrade_and_cancel_subscription(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": "advance"}, headers=headers)
    downgrade = client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": "basic"}, headers=headers)
    assert downgrade.json()["data"]["history"][0]["event_type"] == "downgrade"

    cancel = client.put(
        f"/api/admin/customers/{tenant_id}/subscription", json={"subscription_status": "cancelled"}, headers=headers
    )
    assert cancel.json()["data"]["subscription_status"] == "cancelled"
    assert cancel.json()["data"]["history"][0]["event_type"] == "cancelled"


def test_subscription_update_requires_billing_role(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session, role="support")
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": "advance"}, headers=headers)
    assert response.status_code == 403


def test_invalid_plan_rejected(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": "enterprise"}, headers=headers)
    assert response.status_code == 400
