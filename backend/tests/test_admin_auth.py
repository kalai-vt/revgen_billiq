from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser


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


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def test_admin_login_success(client: TestClient, admin_db_session: Session) -> None:
    _seed_admin(admin_db_session)

    response = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["admin_user"]["email"] == "owner@revgeniq.com"
    assert data["admin_user"]["role"] == "super_admin"
    assert data["access_token"]
    assert data["refresh_token"]


def test_admin_login_wrong_password(client: TestClient, admin_db_session: Session) -> None:
    _seed_admin(admin_db_session)

    response = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "WrongPass!123"})
    assert response.status_code == 401


def test_admin_login_locks_after_repeated_failures(client: TestClient, admin_db_session: Session) -> None:
    _seed_admin(admin_db_session)

    for _ in range(5):
        client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "WrongPass!123"})

    response = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    assert response.status_code == 401
    assert "locked" in response.json()["detail"].lower()


def test_admin_me_requires_valid_token(client: TestClient, admin_db_session: Session) -> None:
    _seed_admin(admin_db_session)
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    access_token = login.json()["data"]["access_token"]

    me = client.get("/api/admin/auth/me", headers=_headers(access_token))
    assert me.status_code == 200
    assert me.json()["data"]["email"] == "owner@revgeniq.com"

    assert client.get("/api/admin/auth/me").status_code == 401
    assert client.get("/api/admin/auth/me", headers=_headers("garbage")).status_code == 401


def test_admin_token_cannot_authenticate_as_tenant_user(client: TestClient, admin_db_session: Session) -> None:
    """A leaked admin token must not work against tenant-user-only endpoints, and vice versa —
    the two token types use separate secrets and a distinct `type` claim precisely so they can
    never be interchanged."""
    _seed_admin(admin_db_session)
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    admin_access_token = login.json()["data"]["access_token"]

    # A tenant-facing endpoint must reject the admin token outright.
    response = client.get("/api/settings", headers=_headers(admin_access_token))
    assert response.status_code == 401


def test_admin_refresh_and_logout(client: TestClient, admin_db_session: Session) -> None:
    _seed_admin(admin_db_session)
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    refresh_token = login.json()["data"]["refresh_token"]

    refreshed = client.post("/api/admin/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    new_access_token = refreshed.json()["data"]["access_token"]
    new_refresh_token = refreshed.json()["data"]["refresh_token"]
    assert new_access_token
    assert new_refresh_token != refresh_token

    # The old refresh token is now revoked (rotated away).
    assert client.post("/api/admin/auth/refresh", json={"refresh_token": refresh_token}).status_code == 401

    logout = client.post("/api/admin/auth/logout", json={"refresh_token": new_refresh_token})
    assert logout.status_code == 200
    assert client.post("/api/admin/auth/refresh", json={"refresh_token": new_refresh_token}).status_code == 401


def test_admin_inactive_account_cannot_login(client: TestClient, admin_db_session: Session) -> None:
    admin = _seed_admin(admin_db_session, email="suspended@revgeniq.com")
    admin.status = "suspended"
    admin_db_session.add(admin)
    admin_db_session.commit()

    response = client.post("/api/admin/auth/login", json={"email": "suspended@revgeniq.com", "password": "AdminPass!123"})
    assert response.status_code == 401
