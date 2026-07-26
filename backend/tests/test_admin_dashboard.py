from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone


def _seed_admin(admin_db_session: Session, email: str = "owner@revgeniq.com") -> AdminUser:
    admin = AdminUser(
        first_name="Riya",
        last_name="Nair",
        email=email,
        password_hash=hash_password("AdminPass!123"),
        role="super_admin",
        status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    admin_db_session.refresh(admin)
    return admin


def _admin_headers(client: TestClient, admin_db_session: Session) -> dict:
    _seed_admin(admin_db_session)
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_dashboard_summary_requires_admin_auth(client: TestClient) -> None:
    assert client.get("/api/admin/dashboard/summary").status_code == 401


def test_dashboard_summary_reflects_registered_tenants(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)

    register_and_activate_standalone(
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

    response = client.get("/api/admin/dashboard/summary", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["total_tenants"] >= 1
    assert data["active_tenants"] >= 1
    assert data["total_users"] >= 1
    assert "revenue_trend" in data
    assert len(data["revenue_trend"]) == 6


def test_dashboard_summary_rejects_tenant_user_token(client: TestClient) -> None:
    owner = register_and_activate_standalone(
        client,
        {
            "company_name": "Beta Retail",
            "legal_name": "Beta Retail Ltd",
            "email": "owner@beta.test",
            "phone": "+15551234568",
            "password": "StrongPass!123",
            "first_name": "Bo",
            "last_name": "Byte",
            "country": "US",
            "currency": "USD",
            "timezone": "UTC",
        },
    )
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    assert client.get("/api/admin/dashboard/summary", headers=headers).status_code == 401
