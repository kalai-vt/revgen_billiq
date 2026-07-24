from __future__ import annotations

import io
import time

from fastapi.testclient import TestClient

from tests.conftest import register_and_activate_standalone


def _register(client: TestClient, email: str = "owner@acme.test") -> dict:
    payload = {
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
    }
    return register_and_activate_standalone(client, payload)


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def test_update_profile(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.put("/api/auth/me", json={"first_name": "Grace", "mobile": "9998887777"}, headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["first_name"] == "Grace"
    assert data["last_name"] == "Lovelace"  # unchanged
    assert data["mobile"] == "9998887777"


def test_change_password_keeps_current_session_alive_but_revokes_others(client: TestClient) -> None:
    owner = _register(client)
    old_access = owner["access_token"]
    old_refresh = owner["refresh_token"]
    headers = _headers(old_access)

    # Session invalidation compares JWT `iat` (whole-second granularity) against
    # session_invalidated_at — sleep past the second boundary so the old token's issue time is
    # unambiguously earlier, matching realistic timing between login and a later password change.
    time.sleep(1.1)

    response = client.put(
        "/api/auth/change-password",
        json={"current_password": "StrongPass!123", "new_password": "NewStrongPass!456"},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    new_access = data["access_token"]
    new_refresh = data["refresh_token"]
    assert new_access != old_access
    assert new_refresh != old_refresh

    # Old access token now rejected.
    stale = client.get("/api/auth/me", headers=_headers(old_access))
    assert stale.status_code == 401

    # Old refresh token now rejected.
    stale_refresh = client.post("/api/auth/refresh", json={"refresh_token": old_refresh})
    assert stale_refresh.status_code == 401

    # New access token from the response works immediately (session continuity).
    fresh = client.get("/api/auth/me", headers=_headers(new_access))
    assert fresh.status_code == 200

    # New password works; old password no longer does.
    new_login = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "NewStrongPass!456"})
    assert new_login.status_code == 200
    old_login = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"})
    assert old_login.status_code == 401


def test_change_password_rejects_wrong_current_password(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.put(
        "/api/auth/change-password",
        json={"current_password": "WrongPassword!123", "new_password": "NewStrongPass!456"},
        headers=headers,
    )
    assert response.status_code == 401


def test_change_password_rejects_same_as_current(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.put(
        "/api/auth/change-password",
        json={"current_password": "StrongPass!123", "new_password": "StrongPass!123"},
        headers=headers,
    )
    assert response.status_code == 400


def test_avatar_upload_rejects_bad_content_type(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.txt", io.BytesIO(b"not an image"), "text/plain")},
        headers=headers,
    )
    assert response.status_code == 400


def test_avatar_upload_accepts_valid_image(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    tiny_png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753"
        "de0000000c4944415478da6360000002000155a24aa50000000049454e44ae426082"
    )
    response = client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.png", io.BytesIO(tiny_png), "image/png")},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["avatar_url"] is not None
    assert data["avatar_url"].startswith("/uploads/avatars/")


def test_login_history_records_success_and_failure(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "wrong-password"})
    client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"})

    response = client.get("/api/auth/me/login-history", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    event_types = {item["event_type"] for item in data["items"]}
    assert "login_success" in event_types
    assert "failed_login" in event_types
