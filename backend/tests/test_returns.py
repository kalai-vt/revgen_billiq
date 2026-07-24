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
        "tax_rate_percent": 0.0,
    }
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _create_invoice(client: TestClient, headers: dict, product: dict, quantity: float = 4) -> dict:
    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": quantity}], "payment_method": "upi"},
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()["data"]


def _inventory_quantity(client: TestClient, headers: dict, product_id: str) -> float:
    response = client.get("/api/inventory", params={"page_size": 100}, headers=headers)
    for row in response.json()["data"]["items"]:
        if row["product_id"] == product_id:
            return row["quantity"]
    raise AssertionError("product not found in inventory")


def test_partial_return_sets_status_partial_and_restocks(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product, quantity=4)
    stock_before = _inventory_quantity(client, headers, product["id"])

    item_id = invoice["items"][0]["id"]
    response = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}], "reason": "damaged"},
        headers=headers,
    )
    assert response.status_code == 200
    ret = response.json()["data"]
    assert ret["refund_amount"] == 20.0
    assert ret["return_number"] == "RET-000001"

    updated_invoice = client.get(f"/api/invoices/{invoice['id']}", headers=headers).json()["data"]
    assert updated_invoice["status"] == "partial"
    assert updated_invoice["items"][0]["returned_quantity"] == 1

    stock_after = _inventory_quantity(client, headers, product["id"])
    assert stock_after == stock_before + 1


def test_full_return_sets_status_refunded(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product, quantity=2)
    item_id = invoice["items"][0]["id"]

    response = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 2}]},
        headers=headers,
    )
    assert response.status_code == 200

    updated_invoice = client.get(f"/api/invoices/{invoice['id']}", headers=headers).json()["data"]
    assert updated_invoice["status"] == "refunded"


def test_repeated_partial_returns_accumulate_and_eventually_refund(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product, quantity=3)
    item_id = invoice["items"][0]["id"]

    first = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}]},
        headers=headers,
    )
    assert first.status_code == 200
    mid_invoice = client.get(f"/api/invoices/{invoice['id']}", headers=headers).json()["data"]
    assert mid_invoice["status"] == "partial"
    assert mid_invoice["items"][0]["returned_quantity"] == 1

    second = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 2}]},
        headers=headers,
    )
    assert second.status_code == 200
    final_invoice = client.get(f"/api/invoices/{invoice['id']}", headers=headers).json()["data"]
    assert final_invoice["status"] == "refunded"
    assert final_invoice["items"][0]["returned_quantity"] == 3


def test_over_return_is_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product, quantity=2)
    item_id = invoice["items"][0]["id"]

    response = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 3}]},
        headers=headers,
    )
    assert response.status_code == 400

    over_after_partial = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 2}]},
        headers=headers,
    )
    assert over_after_partial.status_code == 200

    now_over = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}]},
        headers=headers,
    )
    assert now_over.status_code == 400


def test_cannot_return_on_cancelled_invoice(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product, quantity=2)
    item_id = invoice["items"][0]["id"]

    void_response = client.post(f"/api/invoices/{invoice['id']}/void", headers=headers)
    assert void_response.status_code == 200
    assert void_response.json()["data"]["status"] == "cancelled"

    response = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}]},
        headers=headers,
    )
    assert response.status_code == 400


def test_cannot_cancel_invoice_that_already_has_a_return(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product, quantity=2)
    item_id = invoice["items"][0]["id"]

    client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}]},
        headers=headers,
    )

    void_response = client.post(f"/api/invoices/{invoice['id']}/void", headers=headers)
    assert void_response.status_code == 400


def test_return_refund_amount_includes_proportional_tax(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=10.0, tax_rate_percent=10.0)
    invoice_response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 2}],
            "tax_percentage": 10,
            "payment_method": "upi",
        },
        headers=headers,
    )
    invoice = invoice_response.json()["data"]
    item = invoice["items"][0]
    assert item["line_total"] == 22.0  # 2 * 10 * 1.10
    item_id = item["id"]

    response = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}]},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["refund_amount"] == 11.0  # half of the tax-inclusive line total


def test_return_role_gating(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=owner_headers)
    product = _create_product(client, owner_headers)
    invoice = _create_invoice(client, owner_headers, product, quantity=2)
    item_id = invoice["items"][0]["id"]

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

    denied = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": item_id, "quantity": 1}]},
        headers=staff_headers,
    )
    assert denied.status_code == 403

    # Staff can still view return history/details.
    view = client.get(f"/api/invoices/{invoice['id']}/returns", headers=staff_headers)
    assert view.status_code == 200


def test_return_history_endpoint_lists_across_invoices(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice_a = _create_invoice(client, headers, product, quantity=2)
    invoice_b = _create_invoice(client, headers, product, quantity=2)

    client.post(
        f"/api/invoices/{invoice_a['id']}/returns",
        json={"lines": [{"invoice_item_id": invoice_a["items"][0]["id"], "quantity": 1}]},
        headers=headers,
    )
    client.post(
        f"/api/invoices/{invoice_b['id']}/returns",
        json={"lines": [{"invoice_item_id": invoice_b["items"][0]["id"], "quantity": 1}]},
        headers=headers,
    )

    history = client.get("/api/returns", headers=headers)
    assert history.status_code == 200
    data = history.json()["data"]
    assert data["total"] == 2
    invoice_numbers = {r["invoice_number"] for r in data["items"]}
    assert invoice_numbers == {invoice_a["invoice_number"], invoice_b["invoice_number"]}
