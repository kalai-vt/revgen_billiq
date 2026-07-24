from __future__ import annotations

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


def test_customer_crud(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    create = client.post(
        "/api/customers",
        json={"name": "Jane Buyer", "mobile": "9876543210", "email": "jane@example.com", "address": "123 Main St"},
        headers=headers,
    )
    assert create.status_code == 200
    customer = create.json()["data"]

    update = client.put(f"/api/customers/{customer['id']}", json={"address": "456 New St"}, headers=headers)
    assert update.status_code == 200
    assert update.json()["data"]["address"] == "456 New St"

    delete = client.delete(f"/api/customers/{customer['id']}", headers=headers)
    assert delete.status_code == 200


def test_customer_search_and_pagination(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    for i in range(25):
        client.post("/api/customers", json={"name": f"Customer {i:02d}", "mobile": f"90000000{i:02d}"}, headers=headers)
    client.post("/api/customers", json={"name": "Special Buyer", "mobile": "5551234567"}, headers=headers)

    page1 = client.get("/api/customers", params={"page": 1, "page_size": 20}, headers=headers).json()["data"]
    assert page1["total"] == 26
    assert len(page1["items"]) == 20

    search = client.get("/api/customers", params={"q": "Special"}, headers=headers).json()["data"]
    assert search["total"] == 1
    assert search["items"][0]["name"] == "Special Buyer"


def test_customer_is_tenant_scoped(client: TestClient) -> None:
    tenant_a = _register(client, "owner-a@acme.test")
    tenant_b = _register(client, "owner-b@acme.test")
    headers_a = _headers(tenant_a["access_token"])
    headers_b = _headers(tenant_b["access_token"])

    customer = client.post("/api/customers", json={"name": "Only A"}, headers=headers_a).json()["data"]
    assert client.get("/api/customers", headers=headers_b).json()["data"]["total"] == 0
    assert client.put(f"/api/customers/{customer['id']}", json={"name": "Hijacked"}, headers=headers_b).status_code == 404
    assert client.delete(f"/api/customers/{customer['id']}", headers=headers_b).status_code == 404


def test_customer_delete_requires_owner(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=owner_headers)
    customer = client.post("/api/customers", json={"name": "Test Buyer"}, headers=owner_headers).json()["data"]

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

    # staff can create customers (front-desk use case)
    created = client.post("/api/customers", json={"name": "Walk-in"}, headers=staff_headers)
    assert created.status_code == 200

    # but not delete
    denied = client.delete(f"/api/customers/{customer['id']}", headers=staff_headers)
    assert denied.status_code == 403
