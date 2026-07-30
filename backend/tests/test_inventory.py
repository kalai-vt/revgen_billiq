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


def _create_staff(
    client: TestClient, admin_db_session: Session, owner: dict, owner_headers: dict, email: str = "staff@acme.test"
) -> dict:
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")
    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": email, "password": "StaffPass!123", "role": "staff"},
        headers=owner_headers,
    )
    login = client.post("/api/auth/login", json={"email": email, "password": "StaffPass!123"})
    return login.json()["data"]


def test_product_creation_auto_creates_zero_inventory_row(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    listing = client.get("/api/inventory", headers=headers).json()["data"]
    assert listing["total"] == 1
    assert listing["items"][0]["quantity"] == 0
    assert listing["items"][0]["is_out_of_stock"] is True


def test_manual_add_reduce_adjust_math(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, identifier_value="WID-1")
    pid = product["id"]

    add = client.post(
        f"/api/inventory/{pid}/adjust",
        json={"movement_type": "add", "quantity": 50, "reason": "opening_stock"},
        headers=headers,
    )
    assert add.status_code == 200
    add_data = add.json()["data"]
    assert add_data["previous_stock"] == 0
    assert add_data["added"] == 50
    assert add_data["current_stock"] == 50

    reduce = client.post(
        f"/api/inventory/{pid}/adjust",
        json={"movement_type": "reduce", "quantity": 20, "reason": "damage"},
        headers=headers,
    )
    assert reduce.status_code == 200
    reduce_data = reduce.json()["data"]
    assert reduce_data["previous_stock"] == 50
    assert reduce_data["removed"] == 20
    assert reduce_data["current_stock"] == 30

    adjust = client.post(
        f"/api/inventory/{pid}/adjust",
        json={"movement_type": "adjust", "quantity": 12, "reason": "manual_correction"},
        headers=headers,
    )
    assert adjust.status_code == 200
    adjust_data = adjust.json()["data"]
    assert adjust_data["previous_stock"] == 30
    assert adjust_data["removed"] == 18
    assert adjust_data["current_stock"] == 12


def test_reduce_more_than_current_stock_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    response = client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "reduce", "quantity": 5, "reason": "damage"},
        headers=headers,
    )
    assert response.status_code == 400


def test_add_zero_quantity_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    response = client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "add", "quantity": 0, "reason": "purchase"},
        headers=headers,
    )
    assert response.status_code == 400


def test_stock_history_records_reason_source_and_user(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "add", "quantity": 10, "reason": "purchase", "notes": "Initial batch"},
        headers=headers,
    )

    history = client.get("/api/inventory/stock-history", headers=headers).json()["data"]
    assert history["total"] == 1
    row = history["items"][0]
    assert row["reason"] == "purchase"
    assert row["source"] == "manual"
    assert row["notes"] == "Initial batch"
    assert row["created_by_name"] == "Ada Lovelace"
    assert row["added"] == 10
    assert row["current_stock"] == 10


def test_dashboard_reflects_stock_and_value(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    p1 = _create_product(client, headers, identifier_value="A-1", cost_price=10.0)
    p2 = _create_product(client, headers, name="Gadget", identifier_value="B-1", cost_price=4.0)

    client.post(f"/api/inventory/{p1['id']}/adjust", json={"movement_type": "add", "quantity": 3, "reason": "opening_stock"}, headers=headers)
    client.post(f"/api/inventory/{p2['id']}/adjust", json={"movement_type": "add", "quantity": 2, "reason": "opening_stock"}, headers=headers)
    # p1 now has 3 units (reorder_level default 5) -> low stock; p2 has 2 units -> low stock too
    # push p2 to out of stock territory by reducing back to 0
    client.post(f"/api/inventory/{p2['id']}/adjust", json={"movement_type": "adjust", "quantity": 0, "reason": "manual_correction"}, headers=headers)

    dashboard = client.get("/api/inventory/dashboard", headers=headers).json()["data"]
    assert dashboard["total_products"] == 2
    assert dashboard["total_stock_quantity"] == 3
    assert dashboard["inventory_value"] == 30.0  # 3 units * cost 10
    assert dashboard["low_stock_count"] == 1  # p1: 3 <= reorder_level(5), > 0
    assert dashboard["out_of_stock_count"] == 1  # p2: 0


def test_pos_sale_auto_deducts_stock_and_records_history(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=10.0)
    client.post(f"/api/inventory/{product['id']}/adjust", json={"movement_type": "add", "quantity": 20, "reason": "opening_stock"}, headers=headers)

    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 3}], "payment_method": "upi"},
        headers=headers,
    ).json()["data"]

    inv_after = client.get("/api/inventory", headers=headers).json()["data"]["items"][0]
    assert inv_after["quantity"] == 17

    history = client.get("/api/inventory/stock-history", headers=headers).json()["data"]["items"]
    sale_row = next(row for row in history if row["reason"] == "sale")
    assert sale_row["source"] == "system"
    assert sale_row["removed"] == 3
    assert sale_row["current_stock"] == 17

    # void restores stock
    client.post(f"/api/invoices/{invoice['id']}/void", headers=headers)
    inv_after_void = client.get("/api/inventory", headers=headers).json()["data"]["items"][0]
    assert inv_after_void["quantity"] == 20

    history_after_void = client.get("/api/inventory/stock-history", headers=headers).json()["data"]["items"]
    void_row = next(row for row in history_after_void if row["reason"] == "sale_void")
    assert void_row["source"] == "system"
    assert void_row["added"] == 3
    assert void_row["current_stock"] == 20


def test_staff_can_view_but_not_adjust(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    product = _create_product(client, owner_headers)
    staff = _create_staff(client, admin_db_session, owner, owner_headers)
    staff_headers = _headers(staff["access_token"])

    assert client.get("/api/inventory/dashboard", headers=staff_headers).status_code == 200
    assert client.get("/api/inventory", headers=staff_headers).status_code == 200
    assert client.get("/api/inventory/stock-history", headers=staff_headers).status_code == 200

    denied = client.post(
        f"/api/inventory/{product['id']}/adjust",
        json={"movement_type": "add", "quantity": 5, "reason": "purchase"},
        headers=staff_headers,
    )
    assert denied.status_code == 403


def test_low_stock_and_out_of_stock_filters(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    low = _create_product(client, headers, identifier_value="LOW-1")
    out = _create_product(client, headers, name="Out Item", identifier_value="OUT-1")
    client.post(f"/api/inventory/{low['id']}/adjust", json={"movement_type": "add", "quantity": 2, "reason": "opening_stock"}, headers=headers)

    low_filtered = client.get("/api/inventory", params={"stock_status": "low"}, headers=headers).json()["data"]
    assert low_filtered["total"] == 1
    assert low_filtered["items"][0]["identifier_value"] == "LOW-1"

    out_filtered = client.get("/api/inventory", params={"stock_status": "out"}, headers=headers).json()["data"]
    assert out_filtered["total"] == 1
    assert out_filtered["items"][0]["identifier_value"] == "OUT-1"
