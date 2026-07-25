from __future__ import annotations

from datetime import date, timedelta

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
    payload = {"name": "Widget", "identifier_value": "WID-1", "cost_price": 5.0, "selling_price": 20.0, "tax_rate_percent": 0.0}
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _create_customer(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Ramesh Traders", "mobile": "9876500000"}
    payload.update(overrides)
    response = client.post("/api/customers", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _staff_headers(client: TestClient, owner_headers: dict, email: str = "staff@acme.test") -> dict:
    client.put("/api/settings", json={"plan": "explore"}, headers=owner_headers)
    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": email, "password": "StaffPass!123", "role": "staff"},
        headers=owner_headers,
    )
    login = client.post("/api/auth/login", json={"email": email, "password": "StaffPass!123"})
    return _headers(login.json()["data"]["access_token"])


def _create_invoice(
    client: TestClient,
    headers: dict,
    product: dict,
    quantity: float = 2,
    payment_type: str = "paid",
    customer_id: str | None = None,
    paid_now: float = 0,
    due_date: str | None = None,
) -> dict:
    payload = {
        "lines": [{"product_id": product["id"], "quantity": quantity}],
        "payment_method": "cash" if payment_type == "paid" else "upi",
        "payment_type": payment_type,
    }
    if payment_type == "paid":
        payload["amount_tendered"] = product["selling_price"] * quantity
    else:
        payload["customer_id"] = customer_id
        payload["paid_now"] = paid_now
        payload["due_date"] = due_date or str(date.today() + timedelta(days=15))
    response = client.post("/api/invoices", json=payload, headers=headers)
    return response


def test_credit_sale_requires_customer(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)

    response = client.post(
        "/api/invoices",
        json={
            "lines": [{"product_id": product["id"], "quantity": 1}],
            "payment_method": "upi",
            "payment_type": "credit",
            "due_date": str(date.today() + timedelta(days=15)),
        },
        headers=headers,
    )
    assert response.status_code == 400
    assert "customer" in response.json()["detail"].lower()


def test_credit_sale_requires_credit_enabled_customer(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    customer = _create_customer(client, headers)  # is_credit_enabled defaults False

    response = _create_invoice(client, headers, product, payment_type="credit", customer_id=customer["id"])
    assert response.status_code == 400
    assert "credit" in response.json()["detail"].lower()


def test_credit_sale_sets_outstanding_due_date_and_status(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    customer = _create_customer(client, headers, is_credit_enabled=True, credit_days=10)

    response = _create_invoice(client, headers, product, quantity=2, payment_type="credit", customer_id=customer["id"], paid_now=0)
    assert response.status_code == 200
    invoice = response.json()["data"]
    assert invoice["payment_status"] == "credit"
    assert invoice["paid_amount"] == 0.0
    assert invoice["outstanding_amount"] == 40.0
    assert invoice["due_date"] is not None
    assert invoice["payment_terms"] == "Net 10"


def test_partial_sale_paid_now_reduces_outstanding(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    response = _create_invoice(client, headers, product, quantity=2, payment_type="partial", customer_id=customer["id"], paid_now=15)
    assert response.status_code == 200
    invoice = response.json()["data"]
    assert invoice["payment_status"] == "partially_paid"
    assert invoice["paid_amount"] == 15.0
    assert invoice["outstanding_amount"] == 25.0


def test_credit_limit_unlimited_when_not_set(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=1000.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)  # no credit_limit

    response = _create_invoice(client, headers, product, quantity=5, payment_type="credit", customer_id=customer["id"])
    assert response.status_code == 200


def test_credit_limit_auto_block_blocks_everyone(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True, credit_limit=50.0, auto_block_credit=True)

    response = _create_invoice(client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"])
    assert response.status_code == 400
    assert "blocked" in response.json()["detail"].lower()


def test_credit_limit_blocks_staff_but_allows_owner(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    product = _create_product(client, owner_headers, selling_price=100.0)
    customer = _create_customer(client, owner_headers, is_credit_enabled=True, credit_limit=50.0)
    staff_headers = _staff_headers(client, owner_headers)

    denied = _create_invoice(client, staff_headers, product, quantity=1, payment_type="credit", customer_id=customer["id"])
    assert denied.status_code == 403

    allowed = _create_invoice(client, owner_headers, product, quantity=1, payment_type="credit", customer_id=customer["id"])
    assert allowed.status_code == 200


def test_credit_limit_allow_beyond_limit_permits_staff(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    product = _create_product(client, owner_headers, selling_price=100.0)
    customer = _create_customer(
        client, owner_headers, is_credit_enabled=True, credit_limit=50.0, allow_credit_beyond_limit=True
    )
    staff_headers = _staff_headers(client, owner_headers)

    response = _create_invoice(client, staff_headers, product, quantity=1, payment_type="credit", customer_id=customer["id"])
    assert response.status_code == 200


def test_credit_limit_require_manager_approval_blocks_staff_even_within_limit(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    product = _create_product(client, owner_headers, selling_price=10.0)
    customer = _create_customer(
        client, owner_headers, is_credit_enabled=True, credit_limit=1000.0, require_manager_approval=True
    )
    staff_headers = _staff_headers(client, owner_headers)

    response = _create_invoice(client, staff_headers, product, quantity=1, payment_type="credit", customer_id=customer["id"])
    assert response.status_code == 403


def test_payment_auto_allocation_fifo(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    inv1 = _create_invoice(
        client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"], due_date=str(date.today() + timedelta(days=5))
    ).json()["data"]
    inv2 = _create_invoice(
        client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"], due_date=str(date.today() + timedelta(days=10))
    ).json()["data"]

    payment = client.post(
        "/api/payments",
        json={"customer_id": customer["id"], "amount": 150.0, "payment_method": "cash"},
        headers=headers,
    )
    assert payment.status_code == 200
    data = payment.json()["data"]
    assert len(data["allocations"]) == 2

    inv1_after = client.get(f"/api/invoices/{inv1['id']}", headers=headers).json()["data"]
    inv2_after = client.get(f"/api/invoices/{inv2['id']}", headers=headers).json()["data"]
    assert inv1_after["payment_status"] == "paid"
    assert inv1_after["outstanding_amount"] == 0.0
    assert inv2_after["payment_status"] == "partially_paid"
    assert inv2_after["outstanding_amount"] == 50.0


def test_payment_manual_allocation(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    inv1 = _create_invoice(client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"]).json()["data"]
    inv2 = _create_invoice(client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"]).json()["data"]

    payment = client.post(
        "/api/payments",
        json={
            "customer_id": customer["id"],
            "amount": 100.0,
            "payment_method": "cheque",
            "reference_number": "CHQ-001",
            "allocations": [{"invoice_id": inv2["id"], "amount": 100.0}],
        },
        headers=headers,
    )
    assert payment.status_code == 200

    inv1_after = client.get(f"/api/invoices/{inv1['id']}", headers=headers).json()["data"]
    inv2_after = client.get(f"/api/invoices/{inv2['id']}", headers=headers).json()["data"]
    assert inv1_after["outstanding_amount"] == 100.0
    assert inv2_after["outstanding_amount"] == 0.0
    assert inv2_after["payment_status"] == "paid"


def test_payment_allocation_cannot_exceed_outstanding(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)
    inv = _create_invoice(client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"]).json()["data"]

    response = client.post(
        "/api/payments",
        json={
            "customer_id": customer["id"],
            "amount": 200.0,
            "payment_method": "cash",
            "allocations": [{"invoice_id": inv["id"], "amount": 200.0}],
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_payment_with_no_outstanding_invoices_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    customer = _create_customer(client, headers, is_credit_enabled=True)

    response = client.post(
        "/api/payments", json={"customer_id": customer["id"], "amount": 50.0, "payment_method": "cash"}, headers=headers
    )
    assert response.status_code == 400


def test_ageing_buckets(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    # 40 days overdue -> 31-60 bucket
    overdue_due_date = str(date.today() - timedelta(days=40))
    _create_invoice(client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"], due_date=overdue_due_date)
    # not yet due -> current bucket
    _create_invoice(
        client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"], due_date=str(date.today() + timedelta(days=5))
    )

    report = client.get("/api/outstanding/ageing", headers=headers)
    assert report.status_code == 200
    data = report.json()["data"]
    buckets = {row["bucket"] for row in data["invoices"]}
    assert "31-60" in buckets
    assert "current" in buckets
    assert len(data["by_customer"]) == 1
    assert data["by_customer"][0]["total_outstanding"] == 200.0


def test_customer_ledger_running_balance(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    _create_invoice(client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"])
    client.post("/api/payments", json={"customer_id": customer["id"], "amount": 40.0, "payment_method": "cash"}, headers=headers)

    ledger = client.get(f"/api/customers/{customer['id']}/ledger", headers=headers)
    assert ledger.status_code == 200
    data = ledger.json()["data"]
    assert len(data["entries"]) == 2
    assert data["closing_balance"] == 60.0
    assert data["entries"][-1]["balance"] == 60.0


def test_partial_sale_records_initial_payment_and_reconciles_ledger(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=250.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    _create_invoice(client, headers, product, quantity=1, payment_type="partial", customer_id=customer["id"], paid_now=100.0)

    outstanding = client.get(f"/api/customers/{customer['id']}/outstanding-invoices", headers=headers)
    assert outstanding.status_code == 200
    assert outstanding.json()["data"]["items"][0]["outstanding_amount"] == 150.0

    ledger = client.get(f"/api/customers/{customer['id']}/ledger", headers=headers)
    assert ledger.status_code == 200
    data = ledger.json()["data"]
    assert data["closing_balance"] == 150.0
    assert sum(1 for e in data["entries"] if e["type"] == "payment") == 1

    payments = client.get("/api/payments", params={"customer_id": customer["id"]}, headers=headers)
    assert payments.status_code == 200
    assert payments.json()["data"]["total"] == 1


def test_ledger_adjustment_owner_only(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    customer = _create_customer(client, owner_headers, is_credit_enabled=True)
    staff_headers = _staff_headers(client, owner_headers)

    denied = client.post(
        f"/api/customers/{customer['id']}/ledger/adjustments",
        json={"amount": 50.0, "reason": "Opening balance"},
        headers=staff_headers,
    )
    assert denied.status_code == 403

    allowed = client.post(
        f"/api/customers/{customer['id']}/ledger/adjustments",
        json={"amount": 50.0, "reason": "Opening balance"},
        headers=owner_headers,
    )
    assert allowed.status_code == 200
    assert allowed.json()["data"]["closing_balance"] == 50.0


def test_outstanding_dashboard(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    _create_invoice(client, headers, product, quantity=2, payment_type="credit", customer_id=customer["id"])
    client.post("/api/payments", json={"customer_id": customer["id"], "amount": 50.0, "payment_method": "cash"}, headers=headers)

    dashboard = client.get("/api/outstanding/dashboard", headers=headers)
    assert dashboard.status_code == 200
    data = dashboard.json()["data"]
    assert data["total_outstanding"] == 150.0
    assert data["today_collections"] == 50.0
    assert data["customers_on_credit"] == 1


def test_customer_list_outstanding_filters(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    credit_customer = _create_customer(client, headers, name="Credit Co", is_credit_enabled=True)
    plain_customer = _create_customer(client, headers, name="Plain Co")

    _create_invoice(client, headers, product, quantity=1, payment_type="credit", customer_id=credit_customer["id"])

    with_outstanding = client.get("/api/customers", params={"has_outstanding": True}, headers=headers).json()["data"]
    assert with_outstanding["total"] == 1
    assert with_outstanding["items"][0]["id"] == credit_customer["id"]
    assert with_outstanding["items"][0]["outstanding_amount"] == 100.0

    without_outstanding = client.get("/api/customers", params={"has_outstanding": False}, headers=headers).json()["data"]
    assert without_outstanding["total"] == 1
    assert without_outstanding["items"][0]["id"] == plain_customer["id"]


def test_void_invoice_blocked_when_partially_paid(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    invoice = _create_invoice(client, headers, product, quantity=1, payment_type="partial", customer_id=customer["id"], paid_now=20).json()["data"]

    response = client.post(f"/api/invoices/{invoice['id']}/void", headers=headers)
    assert response.status_code == 400


def test_void_credit_invoice_with_no_payments_allowed(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, selling_price=100.0)
    customer = _create_customer(client, headers, is_credit_enabled=True)

    invoice = _create_invoice(client, headers, product, quantity=1, payment_type="credit", customer_id=customer["id"]).json()["data"]

    response = client.post(f"/api/invoices/{invoice['id']}/void", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["payment_status"] == "cancelled"
    assert response.json()["data"]["outstanding_amount"] == 0.0
