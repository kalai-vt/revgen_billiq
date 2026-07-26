from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser


def _admin_headers(client: TestClient, admin_db_session: Session) -> dict:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email="owner@revgeniq.com",
        password_hash=hash_password("AdminPass!123"), role="super_admin", status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    return {"Authorization": f"Bearer {login.json()['data']['access_token']}"}


def test_system_health_reports_both_databases_up(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)

    response = client.get("/api/admin/system/health", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["billing_db"]["ok"] is True
    assert data["admin_db"]["ok"] is True
    assert data["api_ok"] is True
    assert data["uptime_seconds"] >= 0


def test_recent_activity_includes_login(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    # Trigger an auditable action so the feed has at least one entry.
    client.post("/api/admin/staff/invite", json={"first_name": "A", "last_name": "B", "email": "a@revgeniq.com", "role": "support"}, headers=headers)

    response = client.get("/api/admin/system/activity", headers=headers)
    assert response.status_code == 200
    assert len(response.json()["data"]) >= 1
