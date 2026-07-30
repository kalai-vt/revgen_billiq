from __future__ import annotations

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
    assert response.status_code == 200
    return response.json()["data"]


def test_check_duplicate_detects_case_insensitive_name_match(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, name="Blue Widget")

    response = client.get("/api/products/check-duplicate", params={"name": "blue widget"}, headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name_match"] is not None
    assert data["name_match"]["name"] == "Blue Widget"
    assert data["identifier_match"] is None
    assert data["barcode_match"] is None


def test_check_duplicate_no_match_returns_all_null(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.get("/api/products/check-duplicate", params={"name": "Nothing Here"}, headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name_match"] is None
    assert data["identifier_match"] is None
    assert data["barcode_match"] is None


def test_check_duplicate_detects_identifier_match(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-99")

    response = client.get("/api/products/check-duplicate", params={"identifier_value": "WID-99"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["identifier_match"] is not None


def test_check_duplicate_detects_barcode_match(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    _create_product(client, headers, barcode="1234567890123")

    response = client.get("/api/products/check-duplicate", params={"barcode": "1234567890123"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["barcode_match"] is not None


def test_check_duplicate_excludes_self_when_editing(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, name="Blue Widget")

    response = client.get(
        "/api/products/check-duplicate",
        params={"name": "Blue Widget", "exclude_id": product["id"]},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["name_match"] is None


def test_duplicate_name_is_a_warning_not_a_block(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, name="Blue Widget", identifier_value="WID-1")

    response = client.post(
        "/api/products",
        json={"name": "Blue Widget", "identifier_value": "WID-2", "selling_price": 5.0},
        headers=headers,
    )
    assert response.status_code == 200
