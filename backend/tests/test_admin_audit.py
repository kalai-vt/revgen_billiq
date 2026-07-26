from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone


def _admin_headers(client: TestClient, admin_db_session: Session) -> dict:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email="owner@revgeniq.com",
        password_hash=hash_password("AdminPass!123"), role="super_admin", status="active",
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


def test_audit_log_records_suspend_action(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    client.post(f"/api/admin/customers/{tenant_id}/suspend", headers=headers)

    response = client.get("/api/admin/audit-logs", headers=headers)
    assert response.status_code == 200, response.text
    actions = [row["action"] for row in response.json()["data"]["items"]]
    assert "tenant.suspend" in actions


def test_filter_audit_logs_by_action(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]
    client.post(f"/api/admin/customers/{tenant_id}/suspend", headers=headers)
    client.post(f"/api/admin/customers/{tenant_id}/activate", headers=headers)

    response = client.get("/api/admin/audit-logs?action=tenant.activate", headers=headers)
    rows = response.json()["data"]["items"]
    assert all(row["action"] == "tenant.activate" for row in rows)
    assert len(rows) == 1


def test_list_distinct_actions(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]
    client.post(f"/api/admin/customers/{tenant_id}/suspend", headers=headers)

    response = client.get("/api/admin/audit-logs/actions", headers=headers)
    assert "tenant.suspend" in response.json()["data"]
