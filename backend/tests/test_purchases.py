from __future__ import annotations

from datetime import date

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


def _enable_procurement(client: TestClient, headers: dict) -> None:
    response = client.put("/api/settings", json={"plan": "advance"}, headers=headers)
    assert response.status_code == 200


def _create_product(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Widget", "identifier_value": "WID-1", "cost_price": 5.0, "selling_price": 20.0, "tax_rate_percent": 0.0}
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _create_vendor(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Global Supplies Co"}
    payload.update(overrides)
    response = client.post("/api/procurement/vendors", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _inventory_row(client: TestClient, headers: dict, product_id: str) -> dict:
    response = client.get("/api/inventory", params={"page_size": 100}, headers=headers)
    return next(r for r in response.json()["data"]["items"] if r["product_id"] == product_id)


def test_purchase_entry_increases_stock_and_updates_weighted_average_cost(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers, cost_price=5.0)  # starts at 0 stock

    purchase = client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": "2026-01-01",
            "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}],
        },
        headers=headers,
    )
    assert purchase.status_code == 200, purchase.text
    data = purchase.json()["data"]
    assert data["status"] == "received"
    assert data["total_amount"] == 40.0
    assert data["purchase_number"].startswith("PUR-")

    inv = _inventory_row(client, headers, product["id"])
    assert inv["quantity"] == 10.0
    # Starting stock was 0, so the weighted average collapses to the purchase's unit cost exactly.
    assert inv["cost_price"] == 4.0

    # Second purchase at a different cost blends into a weighted average: (10*4 + 5*10) / 15 = 6.
    second = client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": "2026-01-02",
            "items": [{"product_id": product["id"], "quantity": 5, "unit_cost_price": 10.0}],
        },
        headers=headers,
    )
    assert second.status_code == 200
    inv2 = _inventory_row(client, headers, product["id"])
    assert inv2["quantity"] == 15.0
    assert round(inv2["cost_price"], 2) == 6.0


def test_purchase_entry_updates_vendor_outstanding_when_unpaid(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)

    client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": "2026-01-01",
            "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}],
        },
        headers=headers,
    )

    vendor_after = client.get(f"/api/procurement/vendors/{vendor['id']}", headers=headers).json()["data"]
    assert vendor_after["outstanding_amount"] == 40.0


def test_purchase_entry_paid_immediately_does_not_add_to_outstanding(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)

    purchase = client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": "2026-01-01",
            "payment_mode": "cash",
            "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}],
        },
        headers=headers,
    ).json()["data"]
    assert purchase["payment_status"] == "paid"
    assert purchase["paid_amount"] == 40.0
    assert purchase["outstanding_amount"] == 0.0

    vendor_after = client.get(f"/api/procurement/vendors/{vendor['id']}", headers=headers).json()["data"]
    assert vendor_after["outstanding_amount"] == 0.0


def test_draft_purchase_does_not_touch_stock_until_confirmed(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)

    draft = client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": "2026-01-01",
            "status": "draft",
            "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}],
        },
        headers=headers,
    ).json()["data"]
    assert draft["status"] == "draft"

    inv_before = _inventory_row(client, headers, product["id"])
    assert inv_before["quantity"] == 0.0

    confirm = client.post(f"/api/procurement/purchases/{draft['id']}/confirm", headers=headers)
    assert confirm.status_code == 200
    assert confirm.json()["data"]["status"] == "received"

    inv_after = _inventory_row(client, headers, product["id"])
    assert inv_after["quantity"] == 10.0


def test_cancel_received_purchase_reverses_stock_and_outstanding(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)

    purchase = client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": "2026-01-01",
            "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}],
        },
        headers=headers,
    ).json()["data"]

    cancel = client.post(
        f"/api/procurement/purchases/{purchase['id']}/cancel", json={"reason": "Wrong order"}, headers=headers
    )
    assert cancel.status_code == 200
    assert cancel.json()["data"]["status"] == "cancelled"

    inv = _inventory_row(client, headers, product["id"])
    assert inv["quantity"] == 0.0

    vendor_after = client.get(f"/api/procurement/vendors/{vendor['id']}", headers=headers).json()["data"]
    assert vendor_after["outstanding_amount"] == 0.0


def test_manager_cannot_cancel_purchase(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)

    purchase = client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": "2026-01-01",
            "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}],
        },
        headers=headers,
    ).json()["data"]

    client.post(
        "/api/auth/team",
        json={"first_name": "Mia", "last_name": "Manager", "email": "manager@acme.test", "password": "ManagerPass!123", "role": "manager"},
        headers=headers,
    )
    manager_login = client.post("/api/auth/login", json={"email": "manager@acme.test", "password": "ManagerPass!123"})
    manager_headers = _headers(manager_login.json()["data"]["access_token"])

    response = client.post(f"/api/procurement/purchases/{purchase['id']}/cancel", json={}, headers=manager_headers)
    assert response.status_code == 403


def test_purchase_dashboard_reflects_totals(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)

    client.post(
        "/api/procurement/purchases",
        json={
            "vendor_id": vendor["id"],
            "purchase_date": date.today().isoformat(),
            "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}],
        },
        headers=headers,
    )

    dashboard = client.get(
        "/api/procurement/dashboard",
        params={"date_from": date.today().isoformat(), "date_to": date.today().isoformat()},
        headers=headers,
    )
    assert dashboard.status_code == 200
    kpis = dashboard.json()["data"]["kpis"]
    assert kpis["today_purchase_value"] == 40.0
    assert kpis["active_vendors_count"] == 1
    assert kpis["outstanding_vendor_payments"] == 40.0
    top_vendors = dashboard.json()["data"]["top_vendors"]
    assert top_vendors[0]["vendor_name"] == vendor["name"]
