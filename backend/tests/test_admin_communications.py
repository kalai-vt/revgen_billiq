from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from tests.conftest import FakeEmailProvider, register_and_activate_standalone


def _admin_headers(client: TestClient, admin_db_session: Session, role: str = "super_admin") -> dict:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email="owner@revgeniq.com",
        password_hash=hash_password("AdminPass!123"), role=role, status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    return {"Authorization": f"Bearer {login.json()['data']['access_token']}"}


def _register_tenant(client: TestClient, email: str = "owner@acme.test", company: str = "Acme Retail") -> dict:
    return register_and_activate_standalone(
        client,
        {
            "company_name": company,
            "legal_name": f"{company} Ltd",
            "email": email,
            "phone": f"+1555{uuid.uuid4().int % 10_000_000:07d}",
            "password": "StrongPass!123",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "country": "US",
            "currency": "USD",
            "timezone": "UTC",
        },
    )


def test_broadcast_to_all_tenants(client: TestClient, admin_db_session: Session, fake_email: FakeEmailProvider) -> None:
    headers = _admin_headers(client, admin_db_session)
    _register_tenant(client)

    response = client.post(
        "/api/admin/communications/broadcast",
        json={"subject": "Scheduled maintenance", "message": "We'll be down briefly tonight.", "audience_type": "all"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["recipient_count"] >= 1
    assert any(m.subject == "Scheduled maintenance" for m in fake_email.sent)

    history = client.get("/api/admin/communications", headers=headers).json()["data"]
    assert history[0]["subject"] == "Scheduled maintenance"


def test_broadcast_to_specific_tenant(client: TestClient, admin_db_session: Session, fake_email: FakeEmailProvider) -> None:
    headers = _admin_headers(client, admin_db_session)
    target = _register_tenant(client, email="owner@target.test", company="Target Co")
    _register_tenant(client, email="owner@other.test", company="Other Co")

    response = client.post(
        "/api/admin/communications/broadcast",
        json={
            "subject": "Personal note",
            "message": "Hi there.",
            "audience_type": "tenant",
            "tenant_id": target["tenant"]["id"],
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["recipient_count"] == 1
    assert fake_email.sent[-1].to == "owner@target.test"


def test_broadcast_requires_sales_or_higher_role(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session, role="auditor")
    response = client.post(
        "/api/admin/communications/broadcast",
        json={"subject": "x", "message": "y", "audience_type": "all"},
        headers=headers,
    )
    assert response.status_code == 403
