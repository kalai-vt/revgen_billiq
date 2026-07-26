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


def test_new_signup_generates_notification(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    _register_tenant(client)

    response = client.get("/api/admin/notifications", headers=headers)
    assert response.status_code == 200, response.text
    types = [row["type"] for row in response.json()["data"]]
    assert "new_signup" in types


def test_mark_read_and_unread_count(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    _register_tenant(client)

    notifications = client.get("/api/admin/notifications", headers=headers).json()["data"]
    assert len(notifications) >= 1
    unread_before = client.get("/api/admin/notifications/unread-count", headers=headers).json()["data"]["count"]
    assert unread_before == len(notifications)

    notification_id = notifications[0]["id"]
    mark = client.post(f"/api/admin/notifications/{notification_id}/read", headers=headers)
    assert mark.status_code == 200

    unread_after = client.get("/api/admin/notifications/unread-count", headers=headers).json()["data"]["count"]
    assert unread_after == unread_before - 1

    client.post("/api/admin/notifications/read-all", headers=headers)
    assert client.get("/api/admin/notifications/unread-count", headers=headers).json()["data"]["count"] == 0


def test_repeated_generation_does_not_duplicate(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    _register_tenant(client)

    first = client.get("/api/admin/notifications", headers=headers).json()["data"]
    second = client.get("/api/admin/notifications", headers=headers).json()["data"]
    assert len(first) == len(second)
