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


def test_create_and_list_ticket(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    created = client.post(
        "/api/admin/tickets",
        json={"tenant_id": tenant_id, "subject": "Invoice not printing", "description": "Customer reports blank PDF.", "priority": "high"},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    ticket_id = created.json()["data"]["id"]
    assert created.json()["data"]["status"] == "open"

    listing = client.get("/api/admin/tickets", headers=headers).json()["data"]
    assert any(t["id"] == ticket_id for t in listing)

    filtered = client.get("/api/admin/tickets?status=open", headers=headers).json()["data"]
    assert any(t["id"] == ticket_id for t in filtered)


def test_reply_and_resolve_ticket(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    ticket = client.post(
        "/api/admin/tickets",
        json={"tenant_id": tenant_id, "subject": "Can't login", "description": "Password reset not arriving."},
        headers=headers,
    ).json()["data"]

    reply = client.post(f"/api/admin/tickets/{ticket['id']}/messages", json={"message": "Resent the email."}, headers=headers)
    assert reply.status_code == 200
    assert len(reply.json()["data"]["messages"]) == 1

    resolved = client.put(f"/api/admin/tickets/{ticket['id']}", json={"status": "resolved"}, headers=headers)
    assert resolved.status_code == 200
    assert resolved.json()["data"]["status"] == "resolved"
    assert resolved.json()["data"]["resolved_at"] is not None


def test_ticket_requires_valid_tenant(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    response = client.post(
        "/api/admin/tickets",
        json={"tenant_id": "does-not-exist", "subject": "x", "description": "y"},
        headers=headers,
    )
    assert response.status_code == 404
