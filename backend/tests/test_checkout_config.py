from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.checkout_elements import CHECKOUT_ELEMENT_KEYS
from tests.conftest import register_and_activate_standalone, set_tenant_plan


def _register(client: TestClient, email: str = "owner@acme.test") -> dict:
    phone = "+1555" + str(uuid.uuid4().int)[:7]
    payload = {
        "company_name": "Acme Retail",
        "legal_name": "Acme Retail Ltd",
        "email": email,
        "phone": phone,
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


def test_catalog_lists_every_registry_element_with_groups_and_dependencies(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.get("/api/settings/checkout-elements/catalog", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    keys = {e["key"] for e in data["elements"]}
    assert keys == CHECKOUT_ELEMENT_KEYS
    partial = next(e for e in data["elements"] if e["key"] == "partially_paid")
    assert partial["depends_on_module"] == "payments_credit"
    cash = next(e for e in data["elements"] if e["key"] == "cash")
    assert cash["depends_on_module"] is None
    assert "payment_method" in data["groups"]


def test_default_checkout_config_is_all_enabled(client: TestClient) -> None:
    """Safe defaults: a tenant who has never touched this setting keeps today's behavior, where
    every optional element is visible."""
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.get("/api/settings/checkout-config", headers=headers)
    assert response.status_code == 200, response.text
    config = response.json()["data"]["config"]
    assert set(config) == CHECKOUT_ELEMENT_KEYS
    assert all(config.values())


def test_owner_can_disable_and_re_enable_individual_elements(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    put_response = client.put(
        "/api/settings/checkout-config",
        json={"config": {"discount": False, "amount_tendered": False}},
        headers=headers,
    )
    assert put_response.status_code == 200, put_response.text
    config = put_response.json()["data"]["config"]
    assert config["discount"] is False
    assert config["amount_tendered"] is False
    # Untouched elements are unaffected.
    assert config["tax"] is True
    assert config["hold_bill"] is True

    get_response = client.get("/api/settings/checkout-config", headers=headers)
    assert get_response.json()["data"]["config"]["discount"] is False

    # Re-enabling one element doesn't disturb the other stored override.
    reenable = client.put("/api/settings/checkout-config", json={"config": {"discount": True}}, headers=headers)
    reenabled_config = reenable.json()["data"]["config"]
    assert reenabled_config["discount"] is True
    assert reenabled_config["amount_tendered"] is False


def test_unknown_checkout_element_key_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    response = client.put("/api/settings/checkout-config", json={"config": {"coupon": False}}, headers=headers)
    assert response.status_code == 400
    assert "coupon" in response.json()["detail"].lower()


def test_total_and_checkout_are_not_configurable(client: TestClient) -> None:
    """Total and Checkout are mandatory and must never appear in the registry/catalog at all —
    there is no key for either, so there is nothing a tenant could even attempt to disable."""
    assert "total" not in CHECKOUT_ELEMENT_KEYS
    assert "checkout" not in CHECKOUT_ELEMENT_KEYS


def test_manager_and_staff_can_read_but_not_write_checkout_config(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    headers = _headers(owner["access_token"])
    client.put("/api/settings/checkout-config", json={"config": {"tax": False}}, headers=headers)

    invite = client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    assert invite.status_code == 200, invite.text
    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    read_response = client.get("/api/settings/checkout-config", headers=staff_headers)
    assert read_response.status_code == 200
    assert read_response.json()["data"]["config"]["tax"] is False

    write_response = client.put("/api/settings/checkout-config", json={"config": {"tax": True}}, headers=staff_headers)
    assert write_response.status_code == 403


def test_unauthenticated_request_rejected(client: TestClient) -> None:
    assert client.get("/api/settings/checkout-config").status_code == 401
    assert client.put("/api/settings/checkout-config", json={"config": {}}).status_code == 401


def test_checkout_config_is_tenant_isolated(client: TestClient) -> None:
    owner_a = _register(client, email="owner-a@acme.test")
    headers_a = _headers(owner_a["access_token"])
    client.put("/api/settings/checkout-config", json={"config": {"discount": False, "card": False}}, headers=headers_a)

    owner_b = _register(client, email="owner-b@widgets.test")
    headers_b = _headers(owner_b["access_token"])

    # Tenant B never touched their config — must see all-enabled defaults, not tenant A's overrides.
    config_b = client.get("/api/settings/checkout-config", headers=headers_b).json()["data"]["config"]
    assert config_b["discount"] is True
    assert config_b["card"] is True

    # Tenant A's own overrides are unaffected by tenant B's (non-)actions.
    config_a = client.get("/api/settings/checkout-config", headers=headers_a).json()["data"]["config"]
    assert config_a["discount"] is False
    assert config_a["card"] is False


def test_checkout_config_endpoints_404_when_settings_row_missing(client: TestClient, db_session: Session) -> None:
    """Mirrors the existing behavior of every other /api/settings/* sub-resource."""
    from app.models.settings import Settings

    owner = _register(client)
    headers = _headers(owner["access_token"])

    row = db_session.query(Settings).filter(Settings.tenant_id == owner["tenant"]["id"]).first()
    db_session.delete(row)
    db_session.commit()

    response = client.get("/api/settings/checkout-config", headers=headers)
    assert response.status_code == 404
