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


def _create_product(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "Widget",
        "identifier_value": "WID-1",
        "cost_price": 5.0,
        "selling_price": 20.0,
        "tax_rate_percent": 10.0,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def test_product_crud(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    product = _create_product(client, headers)
    assert product["selling_price"] == 20.0

    update = client.put(f"/api/products/{product['id']}", json={"selling_price": 25.0}, headers=headers)
    assert update.status_code == 200
    assert update.json()["data"]["selling_price"] == 25.0

    delete = client.delete(f"/api/products/{product['id']}", headers=headers)
    assert delete.status_code == 200
    assert client.get("/api/products", headers=headers).json()["data"]["total"] == 0


def test_product_barcode_must_be_unique(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=headers)
    _create_product(client, headers, identifier_value="WID-1", barcode="9999999999")

    duplicate = client.post(
        "/api/products",
        json={"name": "Other", "identifier_value": "WID-2", "barcode": "9999999999", "selling_price": 5.0},
        headers=headers,
    )
    assert duplicate.status_code == 400


def test_product_search_and_pagination(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=headers)

    for i in range(25):
        _create_product(client, headers, name=f"Product {i:02d}", identifier_value=f"SKU-{i:02d}", barcode=None)
    _create_product(client, headers, name="Special Gadget", identifier_value="GADGET-1", barcode="5551234567")

    page1 = client.get("/api/products", params={"page": 1, "page_size": 20}, headers=headers).json()["data"]
    assert page1["total"] == 26
    assert len(page1["items"]) == 20

    page2 = client.get("/api/products", params={"page": 2, "page_size": 20}, headers=headers).json()["data"]
    assert len(page2["items"]) == 6

    search = client.get("/api/products", params={"q": "Gadget"}, headers=headers).json()["data"]
    assert search["total"] == 1
    assert search["items"][0]["identifier_value"] == "GADGET-1"

    barcode_search = client.get("/api/products", params={"q": "5551234567"}, headers=headers).json()["data"]
    assert barcode_search["total"] == 1


def test_invoice_creation_computes_discount_and_tax(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=10.0)

    response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 3}],
            "discount_type": "percent",
            "discount_value": 10,
            "tax_percentage": 18,
            "payment_method": "cash",
            "amount_tendered": 50,
        },
        headers=headers,
    )
    assert response.status_code == 200
    invoice = response.json()["data"]

    assert invoice["subtotal"] == 30.0
    assert invoice["discount_amount"] == 3.0
    assert invoice["taxable_amount"] == 27.0
    assert invoice["tax_percentage"] == 18
    assert round(invoice["tax_amount"], 2) == 4.86  # (30 - 3) * 18%
    assert round(invoice["total_amount"], 2) == 31.86
    assert round(invoice["change_due"], 2) == 18.14
    assert invoice["invoice_number"] == "INV-000001"
    assert invoice["status"] == "paid"


def test_invoice_cash_payment_requires_sufficient_amount_tendered(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=10.0, tax_rate_percent=0.0)

    response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1}],
            "payment_method": "cash",
            "amount_tendered": 5,
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_invoice_pdf_download(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    invoice = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1}],
            "payment_method": "upi",
        },
        headers=headers,
    ).json()["data"]

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.content.startswith(b"%PDF")


def test_invoice_pdf_embeds_uploaded_logo(client: TestClient) -> None:
    import io

    from PIL import Image as PILImage

    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    # Custom Branding is an "explore"+ catalog module (see feature_catalog.py's
    # PLAN_DEFAULT_MODULES) — needed for logo upload to be allowed.
    client.put("/api/settings", json={"plan": "explore"}, headers=headers)

    logo_bytes = io.BytesIO()
    PILImage.new("RGB", (60, 30), color=(20, 90, 200)).save(logo_bytes, format="PNG")
    logo_bytes.seek(0)
    logo_response = client.post(
        "/api/settings/logo", files={"file": ("logo.png", logo_bytes, "image/png")}, headers=headers
    )
    assert logo_response.status_code == 200

    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=headers,
    ).json()["data"]

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.content.startswith(b"%PDF")

    # Without a logo, confirm the PDF still renders fine (fallback path).
    no_logo_owner = _register(client, email="nologo@acme.test")
    no_logo_headers = _headers(no_logo_owner["access_token"])
    no_logo_product = _create_product(client, no_logo_headers)
    no_logo_invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": no_logo_product["id"], "quantity": 1}], "payment_method": "upi"},
        headers=no_logo_headers,
    ).json()["data"]
    no_logo_pdf = client.get(f"/api/invoices/{no_logo_invoice['id']}/pdf", headers=no_logo_headers)
    assert no_logo_pdf.status_code == 200
    assert no_logo_pdf.content.startswith(b"%PDF")


def test_invoice_void_role_gating(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=owner_headers)
    product = _create_product(client, owner_headers)

    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "card"},
        headers=owner_headers,
    ).json()["data"]

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

    denied = client.post(f"/api/invoices/{invoice['id']}/void", headers=staff_headers)
    assert denied.status_code == 403

    allowed = client.post(f"/api/invoices/{invoice['id']}/void", headers=owner_headers)
    assert allowed.status_code == 200
    assert allowed.json()["data"]["status"] == "cancelled"


def test_analytics_dashboard_reflects_activity(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=10.0, tax_rate_percent=0.0)

    client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 2}],
            "payment_method": "cash",
            "amount_tendered": 20,
        },
        headers=headers,
    )

    dashboard = client.get("/api/analytics/dashboard?days=7", headers=headers)
    assert dashboard.status_code == 200
    data = dashboard.json()["data"]
    assert data["kpis"]["today_bill_count"] == 1
    assert data["kpis"]["today_revenue"] == 20.0
    assert data["kpis"]["today_units_sold"] == 2.0
    assert data["kpis"]["total_products"] == 1
    assert data["kpis"]["total_customers"] == 0
    assert len(data["daily_sales"]) == 7
    assert data["top_products"][0]["identifier_value"] == "WID-1"
    assert data["payment_methods"][0]["method"] == "cash"
    assert len(data["recent_invoices"]) == 1
