from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from app.models_admin.audit_log import AdminAuditLog
from tests.conftest import register_and_activate_standalone


def _seed_admin(admin_db_session: Session, email: str = "owner@revgeniq.com", role: str = "super_admin") -> AdminUser:
    admin = AdminUser(
        first_name="Riya",
        last_name="Nair",
        email=email,
        password_hash=hash_password("AdminPass!123"),
        role=role,
        status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    admin_db_session.refresh(admin)
    return admin


def _admin_headers(client: TestClient, admin_db_session: Session, role: str = "super_admin") -> dict:
    _seed_admin(admin_db_session, role=role)
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


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


def test_list_customers_returns_registered_tenant(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    _register_tenant(client)

    response = client.get("/api/admin/customers", headers=headers)
    assert response.status_code == 200, response.text
    companies = [row["company_name"] for row in response.json()["data"]]
    assert "Acme Retail" in companies


def test_get_customer_profile(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.get(f"/api/admin/customers/{tenant_id}", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["company_name"] == "Acme Retail"
    assert data["owner_email"] == "owner@acme.test"
    assert data["status"] == "active"


def test_get_customer_profile_404_for_unknown_tenant(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    assert client.get("/api/admin/customers/does-not-exist", headers=headers).status_code == 404


def test_suspend_and_activate_customer_writes_audit_log(
    client: TestClient, admin_db_session: Session
) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    suspend = client.post(f"/api/admin/customers/{tenant_id}/suspend", headers=headers)
    assert suspend.status_code == 200, suspend.text
    profile = client.get(f"/api/admin/customers/{tenant_id}", headers=headers).json()["data"]
    assert profile["status"] == "suspended"

    activate = client.post(f"/api/admin/customers/{tenant_id}/activate", headers=headers)
    assert activate.status_code == 200
    profile = client.get(f"/api/admin/customers/{tenant_id}", headers=headers).json()["data"]
    assert profile["status"] == "active"

    logged_actions = {row.action for row in admin_db_session.query(AdminAuditLog).all()}
    assert "tenant.suspend" in logged_actions
    assert "tenant.activate" in logged_actions


def test_suspending_tenant_blocks_billing_app_access(client: TestClient, admin_db_session: Session) -> None:
    """Suspension must actually block the tenant from RevGen BillIQ, not just flip a cosmetic
    status flag — both fresh logins and requests using an already-issued access token."""
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]
    tenant_headers = {"Authorization": f"Bearer {owner['access_token']}"}

    # Before suspension, the tenant's existing token works normally.
    assert client.get("/api/settings", headers=tenant_headers).status_code == 200

    client.post(f"/api/admin/customers/{tenant_id}/suspend", headers=headers)

    # The already-issued access token is rejected immediately (mid-session enforcement).
    blocked = client.get("/api/settings", headers=tenant_headers)
    assert blocked.status_code == 403

    # A fresh login attempt is also rejected.
    login = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"})
    assert login.status_code == 403

    # Reactivating restores access.
    client.post(f"/api/admin/customers/{tenant_id}/activate", headers=headers)
    relogin = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"})
    assert relogin.status_code == 200


def test_suspend_requires_operations_or_super_admin_role(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session, role="support")
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.post(f"/api/admin/customers/{tenant_id}/suspend", headers=headers)
    assert response.status_code == 403


def test_reset_password_triggers_email_and_audit_log(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.post(f"/api/admin/customers/{tenant_id}/reset-password", headers=headers)
    assert response.status_code == 200, response.text

    logged = admin_db_session.query(AdminAuditLog).filter(AdminAuditLog.action == "tenant.reset_password").first()
    assert logged is not None
    assert logged.details["email"] == "owner@acme.test"
