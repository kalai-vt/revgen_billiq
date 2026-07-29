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


def test_analytics_reflects_purchase(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)

    today = date.today().isoformat()
    client.post(
        "/api/procurement/purchases",
        json={"vendor_id": vendor["id"], "purchase_date": today, "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}]},
        headers=headers,
    )

    response = client.get("/api/procurement/analytics", params={"date_from": today, "date_to": today}, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["kpis"]["total_purchase_value"] == 40.0
    assert data["kpis"]["total_purchase_count"] == 1
    assert data["vendor_analysis"][0]["vendor_name"] == vendor["name"]
    assert data["product_analysis"][0]["product_name"] == product["name"]


def test_analytics_export_excel(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    today = date.today().isoformat()
    client.post(
        "/api/procurement/purchases",
        json={"vendor_id": vendor["id"], "purchase_date": today, "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}]},
        headers=headers,
    )

    response = client.get(
        "/api/procurement/analytics/export",
        params={"widget": "kpis", "format": "excel", "date_from": today, "date_to": today},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats")


def test_reports_include_purchase_and_outstanding_vendor(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    vendor = _create_vendor(client, headers)
    product = _create_product(client, headers)
    today = date.today().isoformat()
    client.post(
        "/api/procurement/purchases",
        json={"vendor_id": vendor["id"], "purchase_date": today, "items": [{"product_id": product["id"], "quantity": 10, "unit_cost_price": 4.0}]},
        headers=headers,
    )

    response = client.get("/api/procurement/reports", params={"date_from": today, "date_to": today}, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert len(data["purchase_report"]) == 1
    assert data["purchase_report"][0]["vendor_name"] == vendor["name"]
    assert len(data["outstanding_vendor_report"]) == 1
    assert data["outstanding_vendor_report"][0]["outstanding_amount"] == 40.0


def test_reports_export_pdf(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _enable_procurement(client, headers)
    today = date.today().isoformat()

    response = client.get(
        "/api/procurement/reports/export",
        params={"widget": "purchase_report", "format": "pdf", "date_from": today, "date_to": today},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


def test_analytics_blocked_without_feature(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    today = date.today().isoformat()
    response = client.get("/api/procurement/analytics", params={"date_from": today, "date_to": today}, headers=headers)
    assert response.status_code == 402
