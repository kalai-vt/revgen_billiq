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


def test_product_crud_is_tenant_scoped(client: TestClient) -> None:
    tenant_a = _register(client, "owner-a@acme.test", "Acme A")
    tenant_b = _register(client, "owner-b@acme.test", "Acme B")
    headers_a = _headers(tenant_a["access_token"])
    headers_b = _headers(tenant_b["access_token"])

    create_response = client.post(
        "/api/products",
        json={"name": "Widget", "identifier_value": "WID-1", "selling_price": 10.0},
        headers=headers_a,
    )
    assert create_response.status_code == 200
    product_id = create_response.json()["data"]["id"]

    list_response_a = client.get("/api/products", headers=headers_a)
    assert list_response_a.json()["data"]["total"] == 1

    list_response_b = client.get("/api/products", headers=headers_b)
    assert list_response_b.json()["data"]["total"] == 0

    cross_tenant_update = client.put(
        f"/api/products/{product_id}", json={"name": "Hijacked"}, headers=headers_b
    )
    assert cross_tenant_update.status_code == 404

    cross_tenant_delete = client.delete(f"/api/products/{product_id}", headers=headers_b)
    assert cross_tenant_delete.status_code == 404

    same_tenant_update = client.put(
        f"/api/products/{product_id}", json={"name": "Widget Pro"}, headers=headers_a
    )
    assert same_tenant_update.status_code == 200
    assert same_tenant_update.json()["data"]["name"] == "Widget Pro"


def test_invoice_list_is_tenant_scoped(client: TestClient) -> None:
    tenant_a = _register(client, "owner-a@acme.test", "Acme A")
    tenant_b = _register(client, "owner-b@acme.test", "Acme B")
    headers_a = _headers(tenant_a["access_token"])
    headers_b = _headers(tenant_b["access_token"])

    product = client.post(
        "/api/products", json={"name": "Widget", "identifier_value": "WID-1", "selling_price": 10.0}, headers=headers_a
    ).json()["data"]
    invoice = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1}],
            "payment_method": "cash",
            "amount_tendered": 10,
        },
        headers=headers_a,
    ).json()["data"]

    assert client.get("/api/invoices", headers=headers_a).json()["data"]["total"] == 1
    assert client.get("/api/invoices", headers=headers_b).json()["data"]["total"] == 0
    assert client.get(f"/api/invoices/{invoice['id']}", headers=headers_b).status_code == 404


def test_staff_role_denied_product_create_and_delete_but_allowed_view(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client, "owner@acme.test")
    owner_headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")

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

    view_response = client.get("/api/products", headers=staff_headers)
    assert view_response.status_code == 200

    create_response = client.post(
        "/api/products", json={"name": "Widget", "identifier_value": "WID-1", "selling_price": 10.0}, headers=staff_headers
    )
    assert create_response.status_code == 403

    analytics_response = client.get("/api/analytics/dashboard", headers=staff_headers)
    assert analytics_response.status_code == 403
