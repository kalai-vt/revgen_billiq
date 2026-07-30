from __future__ import annotations

import io

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import register_and_activate_standalone, set_tenant_plan


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


def test_logo_upload_rejects_bad_content_type(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")

    response = client.post(
        "/api/settings/logo",
        files={"file": ("logo.txt", io.BytesIO(b"not an image"), "text/plain")},
        headers=headers,
    )
    assert response.status_code == 400


def test_logo_upload_accepts_valid_image(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")

    tiny_png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753"
        "de0000000c4944415478da6360000002000155a24aa50000000049454e44ae426082"
    )
    response = client.post(
        "/api/settings/logo",
        files={"file": ("logo.png", io.BytesIO(tiny_png), "image/png")},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["logo_url"] is not None
    assert data["logo_url"].startswith("/uploads/logos/")

    # Confirms it round-trips through the regular settings GET too.
    get_response = client.get("/api/settings", headers=headers)
    assert get_response.json()["data"]["logo_url"] == data["logo_url"]


def test_logo_upload_rejects_oversized_file(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")

    oversized = b"\xff" * (2 * 1024 * 1024 + 1)
    response = client.post(
        "/api/settings/logo",
        files={"file": ("logo.png", io.BytesIO(oversized), "image/png")},
        headers=headers,
    )
    assert response.status_code == 400


def test_staff_can_read_branding_but_not_upload_logo(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=owner_headers,
    )
    login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(login.json()["data"]["access_token"])

    branding = client.get("/api/settings/branding", headers=staff_headers)
    assert branding.status_code == 200
    assert branding.json()["data"]["logo_url"] is None

    upload = client.post(
        "/api/settings/logo", files={"file": ("logo.png", io.BytesIO(b"x"), "image/png")}, headers=staff_headers
    )
    assert upload.status_code == 403


def test_manager_cannot_upload_logo(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    client.post(
        "/api/auth/team",
        json={"first_name": "Mana", "last_name": "Ger", "email": "manager@acme.test", "password": "MgrPass!123", "role": "manager"},
        headers=owner_headers,
    )
    login = client.post("/api/auth/login", json={"email": "manager@acme.test", "password": "MgrPass!123"})
    manager_headers = _headers(login.json()["data"]["access_token"])

    response = client.post(
        "/api/settings/logo",
        files={"file": ("logo.png", io.BytesIO(b"x"), "image/png")},
        headers=manager_headers,
    )
    assert response.status_code == 403
