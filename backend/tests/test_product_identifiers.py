from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import register_and_activate_standalone, set_tenant_plan


def _register(client: TestClient, email: str, company_name: str = "Acme Retail") -> dict:
    payload = {
        "company_name": company_name,
        "legal_name": f"{company_name} Ltd",
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


def _create_product(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "Widget",
        "identifier_value": "WID-1",
        "cost_price": 5.0,
        "selling_price": 20.0,
        "tax_rate_percent": 0.0,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    return response


def test_default_identifier_type_is_pid(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])
    response = _create_product(client, headers)
    assert response.status_code == 200
    assert response.json()["data"]["identifier_type"] == "pid"


def test_identifier_must_be_unique_within_tenant(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])
    assert _create_product(client, headers, identifier_value="DUP-1").status_code == 200

    duplicate = _create_product(client, headers, name="Other", identifier_value="DUP-1")
    assert duplicate.status_code == 400


def test_identifier_uniqueness_can_be_disabled(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"require_unique_identifier": False}, headers=headers)

    assert _create_product(client, headers, identifier_value="DUP-2").status_code == 200
    duplicate = _create_product(client, headers, name="Other", identifier_value="DUP-2")
    assert duplicate.status_code == 200


def test_custom_identifier_type_requires_label(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])

    missing_label = _create_product(client, headers, identifier_type="custom", identifier_value="MED-1")
    assert missing_label.status_code == 400

    with_label = _create_product(
        client, headers, identifier_type="custom", identifier_label="Medicine Code", identifier_value="MED-1"
    )
    assert with_label.status_code == 200
    assert with_label.json()["data"]["identifier_label"] == "Medicine Code"


def test_identifier_type_can_be_changed_later(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, identifier_type="sku", identifier_value="SKU-1").json()["data"]

    update = client.put(
        f"/api/products/{product['id']}",
        json={"identifier_type": "model_number", "identifier_value": "MODEL-1"},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["data"]["identifier_type"] == "model_number"
    assert update.json()["data"]["identifier_value"] == "MODEL-1"


def test_barcode_uniqueness_is_global_across_tenants(client: TestClient, admin_db_session: Session) -> None:
    tenant_a = _register(client, "owner-a@acme.test", "Acme A")
    tenant_b = _register(client, "owner-b@acme.test", "Acme B")
    headers_a = _headers(tenant_a["access_token"])
    headers_b = _headers(tenant_b["access_token"])
    set_tenant_plan(client, admin_db_session, tenant_a["tenant"]["id"], "explore")
    set_tenant_plan(client, admin_db_session, tenant_b["tenant"]["id"], "explore")

    assert _create_product(client, headers_a, identifier_value="A-1", barcode="7770001").status_code == 200

    conflict = _create_product(client, headers_b, identifier_value="B-1", barcode="7770001")
    assert conflict.status_code == 400


def test_multiple_identifiers_ignored_when_disabled(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])
    response = _create_product(
        client,
        headers,
        identifier_value="PRIMARY-1",
        additional_identifiers=[{"identifier_type": "qr_code", "identifier_value": "QR-1"}],
    )
    assert response.status_code == 200
    assert response.json()["data"]["additional_identifiers"] == []


def test_multiple_identifiers_persist_and_are_searchable_when_enabled(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"enable_multiple_identifiers": True}, headers=headers)

    response = _create_product(
        client,
        headers,
        identifier_value="PRIMARY-2",
        additional_identifiers=[{"identifier_type": "qr_code", "identifier_value": "QR-77"}],
    )
    assert response.status_code == 200
    additional = response.json()["data"]["additional_identifiers"]
    assert len(additional) == 1
    assert additional[0]["identifier_value"] == "QR-77"

    search = client.get("/api/products", params={"q": "QR-77"}, headers=headers).json()["data"]
    assert search["total"] == 1
    assert search["items"][0]["identifier_value"] == "PRIMARY-2"


def test_multiple_identifiers_reject_duplicate_within_same_tenant(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"enable_multiple_identifiers": True}, headers=headers)

    response = _create_product(
        client,
        headers,
        identifier_value="PRIMARY-3",
        additional_identifiers=[{"identifier_type": "qr_code", "identifier_value": "PRIMARY-3"}],
    )
    assert response.status_code == 400


def test_search_matches_category_name(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test")
    headers = _headers(owner["access_token"])
    category = client.post("/api/categories", json={"name": "Beverages"}, headers=headers).json()["data"]
    _create_product(client, headers, identifier_value="BEV-1", category_id=category["id"])

    search = client.get("/api/products", params={"q": "Beverages"}, headers=headers).json()["data"]
    assert search["total"] == 1
    assert search["items"][0]["identifier_value"] == "BEV-1"


def test_product_config_endpoint_accessible_to_all_roles(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client, "owner@acme.test")
    owner_headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")

    owner_config = client.get("/api/settings/product-config", headers=owner_headers)
    assert owner_config.status_code == 200
    assert owner_config.json()["data"]["default_identifier_type"] == "pid"
    assert owner_config.json()["data"]["enable_multiple_identifiers"] is False

    client.post(
        "/api/auth/team",
        json={
            "first_name": "Sam",
            "last_name": "Staff",
            "email": "staff@acme.test",
            "password": "StaffPass!123",
            "role": "staff",
        },
        headers=owner_headers,
    )
    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    staff_config = client.get("/api/settings/product-config", headers=staff_headers)
    assert staff_config.status_code == 200

    # Full settings stay owner-only
    assert client.get("/api/settings", headers=staff_headers).status_code == 403
