from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from tests.conftest import FakeEmailProvider


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


def _login_headers(client: TestClient, email: str = "owner@revgeniq.com", password: str = "AdminPass!123") -> dict:
    login = client.post("/api/admin/auth/login", json={"email": email, "password": password})
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_invite_staff_sends_email_and_lists_as_pending(
    client: TestClient, admin_db_session: Session, fake_email: FakeEmailProvider
) -> None:
    _seed_admin(admin_db_session)
    headers = _login_headers(client)

    response = client.post(
        "/api/admin/staff/invite",
        json={"first_name": "Sam", "last_name": "Support", "email": "sam@revgeniq.com", "role": "support"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["status"] == "pending"

    listing = client.get("/api/admin/staff", headers=headers).json()["data"]
    emails = [row["email"] for row in listing]
    assert "sam@revgeniq.com" in emails

    token = fake_email.last_token_for("sam@revgeniq.com")
    assert token


def test_accept_invite_activates_account_and_allows_login(
    client: TestClient, admin_db_session: Session, fake_email: FakeEmailProvider
) -> None:
    _seed_admin(admin_db_session)
    headers = _login_headers(client)
    client.post(
        "/api/admin/staff/invite",
        json={"first_name": "Sam", "last_name": "Support", "email": "sam@revgeniq.com", "role": "support"},
        headers=headers,
    )
    token = fake_email.last_token_for("sam@revgeniq.com")

    # Cannot log in before accepting the invite (account is still pending).
    assert client.post("/api/admin/auth/login", json={"email": "sam@revgeniq.com", "password": "whatever"}).status_code == 401

    accept = client.post("/api/admin/auth/accept-invite", json={"token": token, "password": "NewStrongPass!123"})
    assert accept.status_code == 200, accept.text

    login = client.post("/api/admin/auth/login", json={"email": "sam@revgeniq.com", "password": "NewStrongPass!123"})
    assert login.status_code == 200, login.text
    assert login.json()["data"]["admin_user"]["role"] == "support"

    # The invite token is single-use.
    assert client.post(
        "/api/admin/auth/accept-invite", json={"token": token, "password": "AnotherPass!123"}
    ).status_code == 400


def test_invite_requires_super_admin_role(client: TestClient, admin_db_session: Session) -> None:
    _seed_admin(admin_db_session, email="ops@revgeniq.com", role="operations")
    headers = _login_headers(client, email="ops@revgeniq.com")

    response = client.post(
        "/api/admin/staff/invite",
        json={"first_name": "Sam", "last_name": "Support", "email": "sam@revgeniq.com", "role": "support"},
        headers=headers,
    )
    assert response.status_code == 403


def test_update_role_and_deactivate_reactivate(client: TestClient, admin_db_session: Session, fake_email) -> None:
    _seed_admin(admin_db_session)
    headers = _login_headers(client)
    invited = client.post(
        "/api/admin/staff/invite",
        json={"first_name": "Sam", "last_name": "Support", "email": "sam@revgeniq.com", "role": "support"},
        headers=headers,
    ).json()["data"]
    admin_id = invited["id"]

    role_update = client.put(f"/api/admin/staff/{admin_id}/role", json={"role": "finance"}, headers=headers)
    assert role_update.status_code == 200
    assert role_update.json()["data"]["role"] == "finance"

    deactivate = client.post(f"/api/admin/staff/{admin_id}/deactivate", headers=headers)
    assert deactivate.status_code == 200
    assert deactivate.json()["data"]["is_active"] is False

    activate = client.post(f"/api/admin/staff/{admin_id}/activate", headers=headers)
    assert activate.status_code == 200
    assert activate.json()["data"]["is_active"] is True


def test_cannot_deactivate_own_account(client: TestClient, admin_db_session: Session) -> None:
    admin = _seed_admin(admin_db_session)
    headers = _login_headers(client)

    response = client.post(f"/api/admin/staff/{admin.id}/deactivate", headers=headers)
    assert response.status_code == 400


def test_change_own_password(client: TestClient, admin_db_session: Session) -> None:
    _seed_admin(admin_db_session)
    headers = _login_headers(client)

    wrong = client.post(
        "/api/admin/auth/change-password",
        json={"current_password": "WrongPass!123", "new_password": "BrandNewPass!123"},
        headers=headers,
    )
    assert wrong.status_code == 401

    correct = client.post(
        "/api/admin/auth/change-password",
        json={"current_password": "AdminPass!123", "new_password": "BrandNewPass!123"},
        headers=headers,
    )
    assert correct.status_code == 200

    relogin = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "BrandNewPass!123"})
    assert relogin.status_code == 200
