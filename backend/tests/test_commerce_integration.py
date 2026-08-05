from __future__ import annotations

from datetime import date, datetime, timezone

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


def _enable_commerce(client: TestClient, admin_db_session: Session, owner: dict) -> None:
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")


def _create_product(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Cheese Burger", "identifier_value": "SKU-BURGER", "cost_price": 60.0, "selling_price": 149.0, "tax_rate_percent": 5.0}
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def test_commerce_endpoints_blocked_without_feature(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    response = client.get("/api/commerce/orders", headers=headers)
    assert response.status_code == 402


def test_config_update_encrypts_and_hides_secret(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_commerce(client, admin_db_session, owner)

    get_response = client.get("/api/commerce/configs/swiggy", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["data"]["status"] == "not_connected"
    assert get_response.json()["data"]["has_api_key"] is False
    assert "webhook_path" in get_response.json()["data"]

    update = client.put(
        "/api/commerce/configs/swiggy",
        json={"is_enabled": True, "api_key": "secret-key-123", "api_secret": "secret-value-456", "store_name": "Downtown Store"},
        headers=headers,
    )
    assert update.status_code == 200, update.text
    data = update.json()["data"]
    assert data["is_enabled"] is True
    assert data["has_api_key"] is True
    assert data["has_api_secret"] is True
    assert "secret-key-123" not in str(data)
    assert data["store_name"] == "Downtown Store"


def test_mock_order_creates_unmapped_order_with_sync_error(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_commerce(client, admin_db_session, owner)
    client.put("/api/commerce/configs/swiggy", json={"is_enabled": True}, headers=headers)

    response = client.post("/api/commerce/orders/mock-trigger", json={"platform": "swiggy", "item_count": 2}, headers=headers)
    assert response.status_code == 200, response.text
    order = response.json()["data"]
    assert order["platform"] == "swiggy"
    assert order["invoice_id"] is None
    assert order["sync_error"] is not None
    assert len(order["items"]) == 2

    unmapped = client.get("/api/commerce/unmapped-skus", headers=headers)
    assert unmapped.status_code == 200
    assert len(unmapped.json()["data"]) > 0


def test_product_mapping_backfills_and_retry_billing_succeeds(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_commerce(client, admin_db_session, owner)
    client.put("/api/commerce/configs/zomato", json={"is_enabled": True}, headers=headers)

    order = client.post("/api/commerce/orders/mock-trigger", json={"platform": "zomato", "item_count": 1}, headers=headers).json()["data"]
    sku = order["items"][0]["platform_sku"]
    item_name = order["items"][0]["item_name"]

    product = _create_product(client, headers, name=item_name, identifier_value=sku)

    mapping = client.post(
        "/api/commerce/product-mappings", json={"platform": "zomato", "platform_sku": sku, "product_id": product["id"]}, headers=headers
    )
    assert mapping.status_code == 200, mapping.text

    retry = client.post(f"/api/commerce/orders/{order['id']}/retry-billing", headers=headers)
    assert retry.status_code == 200, retry.text
    billed_order = retry.json()["data"]
    assert billed_order["invoice_id"] is not None
    assert billed_order["invoice_number"]


def test_commerce_dashboard_reflects_mock_order(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_commerce(client, admin_db_session, owner)
    client.put("/api/commerce/configs/swiggy", json={"is_enabled": True}, headers=headers)
    client.post("/api/commerce/orders/mock-trigger", json={"platform": "swiggy", "item_count": 1}, headers=headers)

    # This tenant registers with timezone "UTC" (see _register above), and the commerce
    # dashboard compares `date_from`/`date_to` against order_time's stored UTC date directly
    # (no tenant-timezone conversion) — `date.today()` uses the test process's OS-local
    # timezone, which silently breaks this assertion on any non-UTC dev machine.
    today = datetime.now(timezone.utc).date().isoformat()
    dashboard = client.get("/api/commerce/dashboard", params={"date_from": today, "date_to": today}, headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    kpis = dashboard.json()["data"]["kpis"]
    assert kpis["total_online_orders"] == 1
    assert kpis["swiggy_orders"] == 1
    assert kpis["unmapped_sku_count"] >= 1


def test_webhook_receiver_ingests_order_with_valid_token(
    client: TestClient, admin_db_session: Session
) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_commerce(client, admin_db_session, owner)
    config = client.put("/api/commerce/configs/swiggy", json={"is_enabled": True}, headers=headers).json()["data"]
    webhook_path = config["webhook_path"]

    payload = {
        "order_id": "EXT-001",
        "status": "placed",
        "customer_name": "Test Customer",
        "items": [{"sku": "SKU-X", "name": "Test Item", "quantity": 2, "unit_price": 100.0}],
        "subtotal": 200.0,
        "total_amount": 210.0,
    }
    response = client.post(webhook_path, json=payload)
    assert response.status_code == 200, response.text

    orders = client.get("/api/commerce/orders", params={"platform": "swiggy"}, headers=headers)
    assert orders.json()["data"]["total"] == 1
    assert orders.json()["data"]["items"][0]["platform_order_id"] == "EXT-001"


def test_webhook_receiver_rejects_unknown_token(client: TestClient) -> None:
    response = client.post(
        "/api/commerce/webhooks/swiggy/not-a-real-token",
        json={"order_id": "X", "items": [{"sku": "A", "name": "A", "quantity": 1, "unit_price": 1.0}], "subtotal": 1.0, "total_amount": 1.0},
    )
    assert response.status_code == 404


def test_staff_cannot_update_commerce_config(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_commerce(client, admin_db_session, owner)

    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=headers,
    )
    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    response = client.put("/api/commerce/configs/swiggy", json={"is_enabled": True}, headers=staff_headers)
    assert response.status_code == 403
