from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.feature_flag import TenantFeatureFlag
from tests.conftest import register_and_activate_standalone

MODULES = ("restaurant", "floor_management", "table_management", "kot", "restaurant_reports")


def _setup(client: TestClient, db_session: Session) -> dict:
    auth = register_and_activate_standalone(
        client,
        {
            "company_name": "OG Cafe",
            "legal_name": "OG Cafe Ltd",
            "email": f"owner-{uuid.uuid4().hex[:8]}@dine.test",
            "phone": f"+1555{uuid.uuid4().int % 10_000_000:07d}",
            "password": "StrongPass!123",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "country": "IN",
            "currency": "INR",
            "timezone": "UTC",
        },
    )
    for key in MODULES:
        db_session.add(TenantFeatureFlag(tenant_id=auth["tenant"]["id"], module_key=key, status="enabled"))
    db_session.commit()
    return {"Authorization": f"Bearer {auth['access_token']}"}


def _product(client: TestClient, headers: dict, price: float) -> str:
    response = client.post(
        "/api/products",
        json={
            "name": f"Dish {uuid.uuid4().hex[:6]}",
            "identifier_value": f"SKU-{uuid.uuid4().hex[:8]}",
            "cost_price": price / 2,
            "selling_price": price,
            "tax_rate_percent": 0.0,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]["id"]


def _billed_order(client: TestClient, headers: dict, table_id: str, product_id: str, qty: int, method: str = "cash"):
    order = client.post(
        "/api/restaurant/orders",
        json={
            "order_type": "dine_in",
            "table_id": table_id,
            "guest_count": 2,
            "items": [{"product_id": product_id, "quantity": qty}],
        },
        headers=headers,
    )
    assert order.status_code == 200, order.text
    order_id = order.json()["data"]["id"]
    billed = client.post(
        f"/api/restaurant/orders/{order_id}/bill", json={"payment_method": method}, headers=headers
    )
    assert billed.status_code == 200, billed.text
    return order_id


def test_reports_are_gated_on_the_reports_module(client: TestClient, db_session: Session):
    auth = register_and_activate_standalone(
        client,
        {
            "company_name": "No Reports", "legal_name": "No Reports Ltd",
            "email": f"o-{uuid.uuid4().hex[:8]}@dine.test",
            "phone": f"+1555{uuid.uuid4().int % 10_000_000:07d}",
            "password": "StrongPass!123", "first_name": "A", "last_name": "B",
            "country": "IN", "currency": "INR", "timezone": "UTC",
        },
    )
    response = client.get(
        "/api/restaurant/reports/table-sales", headers={"Authorization": f"Bearer {auth['access_token']}"}
    )
    assert response.status_code == 402


def test_table_sales_attributes_revenue_to_the_right_table(client: TestClient, db_session: Session):
    headers = _setup(client, db_session)
    busy = client.post("/api/restaurant/tables", json={"name": "T1"}, headers=headers).json()["data"]
    quiet = client.post("/api/restaurant/tables", json={"name": "T2"}, headers=headers).json()["data"]
    dish = _product(client, headers, 100.0)

    _billed_order(client, headers, busy["id"], dish, 2)   # 200
    _billed_order(client, headers, busy["id"], dish, 1)   # 100

    data = client.get("/api/restaurant/reports/table-sales", headers=headers).json()["data"]
    by_name = {row["table_name"]: row for row in data["tables"]}

    assert by_name["T1"]["orders"] == 2
    assert by_name["T1"]["revenue"] == 300.0
    assert by_name["T1"]["average_order_value"] == 150.0
    assert by_name["T1"]["guests"] == 4
    # A table nobody sat at still appears, with zeroes rather than being missing entirely.
    assert by_name["T2"]["orders"] == 0
    assert by_name["T2"]["revenue"] == 0.0


def test_open_and_cancelled_orders_are_not_counted_as_revenue(client: TestClient, db_session: Session):
    headers = _setup(client, db_session)
    table = client.post("/api/restaurant/tables", json={"name": "T9"}, headers=headers).json()["data"]
    dish = _product(client, headers, 500.0)

    # An open order has not been paid for, so it must not show up as takings.
    client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": table["id"], "items": [{"product_id": dish, "quantity": 1}]},
        headers=headers,
    )
    data = client.get("/api/restaurant/reports/table-sales", headers=headers).json()["data"]
    assert data["tables"][0]["revenue"] == 0.0
    assert data["tables"][0]["orders"] == 0


def test_kot_report_counts_tickets_and_separates_cancellations(client: TestClient, db_session: Session):
    headers = _setup(client, db_session)
    table = client.post("/api/restaurant/tables", json={"name": "K1"}, headers=headers).json()["data"]
    dish = _product(client, headers, 80.0)
    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": table["id"], "items": [{"product_id": dish, "quantity": 2}]},
        headers=headers,
    ).json()["data"]

    kot = client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers).json()["data"]
    client.post(f"/api/restaurant/kots/{kot['id']}/cancel", json={"reason": "86'd"}, headers=headers)
    second = client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers).json()["data"]
    client.put(f"/api/restaurant/kots/{second['id']}/status", json={"status": "preparing"}, headers=headers)

    data = client.get("/api/restaurant/reports/kots", headers=headers).json()["data"]
    assert data["total_kots"] == 2
    assert data["cancelled"] == 1
    assert data["cancellation_rate_percent"] == 50.0
    assert data["by_status"]["preparing"] == 1


def test_sales_summary_splits_dine_in_from_takeaway(client: TestClient, db_session: Session):
    headers = _setup(client, db_session)
    table = client.post("/api/restaurant/tables", json={"name": "S1"}, headers=headers).json()["data"]
    dish = _product(client, headers, 250.0)
    _billed_order(client, headers, table["id"], dish, 1)

    takeaway = client.post(
        "/api/restaurant/orders",
        json={"order_type": "takeaway", "items": [{"product_id": dish, "quantity": 2}]},
        headers=headers,
    ).json()["data"]
    client.post(f"/api/restaurant/orders/{takeaway['id']}/bill", json={"payment_method": "upi"}, headers=headers)

    data = client.get("/api/restaurant/reports/sales-summary", headers=headers).json()["data"]
    assert data["dine_in"]["orders"] == 1
    assert data["dine_in"]["revenue"] == 250.0
    assert data["takeaway"]["orders"] == 1
    assert data["takeaway"]["revenue"] == 500.0
    assert data["revenue"] == 750.0
    assert data["average_order_value"] == 375.0


def test_payment_report_breaks_out_upi(client: TestClient, db_session: Session):
    headers = _setup(client, db_session)
    table = client.post("/api/restaurant/tables", json={"name": "P1"}, headers=headers).json()["data"]
    dish = _product(client, headers, 300.0)
    _billed_order(client, headers, table["id"], dish, 1, method="upi")
    _billed_order(client, headers, table["id"], dish, 1, method="cash")

    data = client.get("/api/restaurant/reports/payments", headers=headers).json()["data"]
    # UPI is broken out on purpose — it is what shows whether the QR flow is actually being used.
    assert data["upi"]["invoices"] == 1
    assert data["upi"]["amount"] == 300.0
    assert data["by_method"]["cash"]["invoices"] == 1
    assert data["total_collected"] == 600.0


def test_a_date_range_excludes_orders_outside_it(client: TestClient, db_session: Session):
    headers = _setup(client, db_session)
    table = client.post("/api/restaurant/tables", json={"name": "D1"}, headers=headers).json()["data"]
    dish = _product(client, headers, 120.0)
    _billed_order(client, headers, table["id"], dish, 1)

    past = client.get(
        "/api/restaurant/reports/sales-summary?start_date=2020-01-01&end_date=2020-01-31", headers=headers
    ).json()["data"]
    assert past["orders"] == 0
    assert past["revenue"] == 0.0
