from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import register_and_activate_standalone, set_tenant_plan


def _register(client: TestClient, admin_db_session: Session, email: str = "owner@acme.test") -> dict:
    payload = {
        "company_name": "Acme Retail",
        "legal_name": "Acme Retail Ltd",
        "email": email,
        "phone": f"+1555{uuid.uuid4().int % 10_000_000:07d}",
        "password": "StrongPass!123",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "country": "US",
        "currency": "USD",
        "timezone": "UTC",
    }
    owner = register_and_activate_standalone(client, payload)
    # Invoice Designer is an "advance"-only catalog module (see feature_catalog.py's
    # PLAN_DEFAULT_MODULES — it's a premium module that only "advance" grants by default) — every
    # test in this file exercises that module, so it needs to be enabled for the fixture tenant,
    # same as _manager_headers already does below.
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    return owner


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def _manager_headers(
    client: TestClient, admin_db_session: Session, owner: dict, owner_headers: dict, email: str = "staff@acme.test"
) -> dict:
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    client.post(
        "/api/auth/team",
        json={
            "first_name": "Sam",
            "last_name": "Staff",
            "email": email,
            "password": "StaffPass!123",
            "role": "manager",
        },
        headers=owner_headers,
    )
    login = client.post("/api/auth/login", json={"email": email, "password": "StaffPass!123"})
    return _headers(login.json()["data"]["access_token"])


def test_defaults_are_lazily_seeded(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])

    response = client.get("/api/invoice-templates/defaults", headers=headers)
    assert response.status_code == 200
    by_type = response.json()["data"]
    assert "tax_invoice" in by_type
    tax_invoice = by_type["tax_invoice"]
    assert tax_invoice["is_builtin"] is True
    assert tax_invoice["is_default"] is True
    assert tax_invoice["config"]["version"] == 1
    assert tax_invoice["config"]["item_table"]["columns"]

    # Calling again must not create a second row for the same (tenant, document_type).
    response2 = client.get("/api/invoice-templates?document_type=tax_invoice", headers=headers)
    templates = response2.json()["data"]
    assert len(templates) == 1


def test_create_duplicate_update_delete_lifecycle(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])

    created = client.post(
        "/api/invoice-templates",
        json={"document_type": "tax_invoice", "name": "My Custom Invoice"},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    template = created.json()["data"]
    assert template["is_builtin"] is False
    assert template["is_default"] is False

    updated = client.put(
        f"/api/invoice-templates/{template['id']}",
        json={"name": "Renamed Invoice", "config": {**template["config"], "theme": {**template["config"]["theme"], "primary_color": "#ff0000"}}},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["name"] == "Renamed Invoice"
    assert updated.json()["data"]["config"]["theme"]["primary_color"] == "#ff0000"

    duplicated = client.post(f"/api/invoice-templates/{template['id']}/duplicate", headers=headers)
    assert duplicated.status_code == 200
    copy = duplicated.json()["data"]
    assert copy["id"] != template["id"]
    assert copy["name"] == "Renamed Invoice (Copy)"

    deleted = client.delete(f"/api/invoice-templates/{template['id']}", headers=headers)
    assert deleted.status_code == 200
    assert client.get(f"/api/invoice-templates/{template['id']}", headers=headers).status_code == 404


def test_set_default_flips_exactly_one(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])
    client.get("/api/invoice-templates/defaults", headers=headers)  # seed builtin default

    created = client.post(
        "/api/invoice-templates", json={"document_type": "tax_invoice", "name": "Alt Invoice"}, headers=headers
    ).json()["data"]

    set_default = client.post(f"/api/invoice-templates/{created['id']}/set-default", headers=headers)
    assert set_default.status_code == 200
    assert set_default.json()["data"]["is_default"] is True

    templates = client.get("/api/invoice-templates?document_type=tax_invoice", headers=headers).json()["data"]
    defaults = [t for t in templates if t["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == created["id"]


def test_builtin_template_cannot_be_edited_or_deleted(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])
    by_type = client.get("/api/invoice-templates/defaults", headers=headers).json()["data"]
    builtin = by_type["tax_invoice"]

    assert client.put(f"/api/invoice-templates/{builtin['id']}", json={"name": "Nope"}, headers=headers).status_code == 400
    assert client.delete(f"/api/invoice-templates/{builtin['id']}", headers=headers).status_code == 400


def test_deleting_default_falls_back_to_another_template(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])
    by_type = client.get("/api/invoice-templates/defaults", headers=headers).json()["data"]
    builtin = by_type["tax_invoice"]

    alt = client.post(
        "/api/invoice-templates", json={"document_type": "tax_invoice", "name": "Alt"}, headers=headers
    ).json()["data"]
    client.post(f"/api/invoice-templates/{alt['id']}/set-default", headers=headers)

    # Now `alt` is default; deleting it should fall back to the remaining builtin template.
    deleted = client.delete(f"/api/invoice-templates/{alt['id']}", headers=headers)
    assert deleted.status_code == 200

    templates = client.get("/api/invoice-templates?document_type=tax_invoice", headers=headers).json()["data"]
    assert len(templates) == 1
    assert templates[0]["id"] == builtin["id"]
    assert templates[0]["is_default"] is True


def test_tenant_isolation(client: TestClient, admin_db_session: Session) -> None:
    owner_a = _register(client, admin_db_session, email="owner-a@acme.test")
    owner_b = _register(client, admin_db_session, email="owner-b@beta.test")
    headers_a = _headers(owner_a["access_token"])
    headers_b = _headers(owner_b["access_token"])

    template_a = client.post(
        "/api/invoice-templates", json={"document_type": "tax_invoice", "name": "A's Invoice"}, headers=headers_a
    ).json()["data"]

    assert client.get(f"/api/invoice-templates/{template_a['id']}", headers=headers_b).status_code == 404
    assert client.put(
        f"/api/invoice-templates/{template_a['id']}", json={"name": "Hijacked"}, headers=headers_b
    ).status_code == 404
    assert client.delete(f"/api/invoice-templates/{template_a['id']}", headers=headers_b).status_code == 404


def test_mutations_require_owner_role(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    owner_headers = _headers(owner["access_token"])
    manager_headers = _manager_headers(client, admin_db_session, owner, owner_headers)

    assert client.get("/api/invoice-templates/defaults", headers=manager_headers).status_code == 200
    assert (
        client.post(
            "/api/invoice-templates", json={"document_type": "tax_invoice", "name": "X"}, headers=manager_headers
        ).status_code
        == 403
    )
