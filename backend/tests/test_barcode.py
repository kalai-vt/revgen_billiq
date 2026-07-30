from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.barcode import _check_digit, generate_ean13
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


def test_check_digit_matches_known_ean13() -> None:
    # 690123456789 -> real-world style EAN-13 prefix; check digit computed manually.
    assert _check_digit("400638133393") == 1  # a well-known EAN-13 test value: 4006381333931


def test_generate_ean13_is_13_digits_and_valid_checksum(client: TestClient) -> None:
    owner = _register(client)
    _headers(owner["access_token"])
    from app.core.db import SessionLocal

    db = SessionLocal()
    try:
        barcode = generate_ean13(db)
    finally:
        db.close()
    assert len(barcode) == 13
    assert barcode.isdigit()
    assert _check_digit(barcode[:12]) == int(barcode[12])


def test_generate_barcode_endpoint_returns_unique_values(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")

    first = client.get("/api/catalog/barcode/generate", headers=headers)
    second = client.get("/api/catalog/barcode/generate", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["data"]["barcode"] != second.json()["data"]["barcode"]


def test_create_product_auto_generates_barcode_when_enabled_and_blank(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    client.put("/api/settings", json={"enable_barcode": True}, headers=headers)

    product = client.post(
        "/api/products",
        json={"name": "Widget", "identifier_value": "WID-1", "selling_price": 10.0},
        headers=headers,
    ).json()["data"]
    assert product["barcode"] is not None
    assert len(product["barcode"]) == 13


def test_create_product_does_not_generate_barcode_when_disabled(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    client.put("/api/settings", json={"enable_barcode": False}, headers=headers)

    product = client.post(
        "/api/products",
        json={"name": "Widget", "identifier_value": "WID-1", "selling_price": 10.0},
        headers=headers,
    ).json()["data"]
    assert product["barcode"] is None


def test_manual_barcode_still_respected_when_auto_generate_enabled(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    client.put("/api/settings", json={"enable_barcode": True}, headers=headers)

    product = client.post(
        "/api/products",
        json={"name": "Widget", "identifier_value": "WID-1", "selling_price": 10.0, "barcode": "1234567890123"},
        headers=headers,
    ).json()["data"]
    assert product["barcode"] == "1234567890123"
