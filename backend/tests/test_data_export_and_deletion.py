from __future__ import annotations

import io
import zipfile

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


def test_export_data_returns_zip_with_expected_files(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.post("/api/customers", json={"name": "Test Customer"}, headers=headers)
    client.post("/api/products", json={"name": "Widget", "identifier_value": "W-1", "selling_price": 10}, headers=headers)

    response = client.get("/api/settings/export-data", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    assert {"customers.csv", "products.csv", "invoices.csv", "team.csv", "README.txt"}.issubset(names)
    assert "Test Customer" in archive.read("customers.csv").decode()
    assert "Widget" in archive.read("products.csv").decode()


def test_delete_account_requires_correct_password(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.post("/api/settings/delete-account", json={"password": "WrongPassword!123"}, headers=headers)
    assert response.status_code == 401


def test_delete_account_locks_out_immediately(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.post("/api/settings/delete-account", json={"password": "StrongPass!123"}, headers=headers)
    assert response.status_code == 200, response.text

    me_response = client.get("/api/auth/me", headers=headers)
    assert me_response.status_code == 403

    login_response = client.post(
        "/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"}
    )
    assert login_response.status_code in (401, 403)


def test_delete_account_requires_owner_role(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    client.post(
        "/api/auth/team",
        json={"first_name": "S", "last_name": "T", "email": "staff@acme.test", "password": "StaffPass!123", "role": "manager"},
        headers=owner_headers,
    )
    manager_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    manager_headers = _headers(manager_login.json()["data"]["access_token"])

    response = client.post("/api/settings/delete-account", json={"password": "StaffPass!123"}, headers=manager_headers)
    assert response.status_code == 403
