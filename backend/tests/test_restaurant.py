from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.feature_flag import TenantFeatureFlag
from tests.conftest import register_and_activate_standalone

RESTAURANT_MODULES = (
    "restaurant",
    "floor_management",
    "table_management",
    "kot",
    "table_transfer",
    "table_merge",
    "table_split",
)


def _register(client: TestClient, email: str = "owner@dine.test") -> dict:
    payload = {
        "company_name": "OG Cafe",
        "legal_name": "OG Cafe Ltd",
        "email": email,
        "phone": f"+1555{uuid.uuid4().int % 10_000_000:07d}",
        "password": "StrongPass!123",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "country": "IN",
        "currency": "INR",
        "timezone": "UTC",
    }
    return register_and_activate_standalone(client, payload)


def _enable_restaurant(db_session: Session, tenant_id: str) -> None:
    """Restaurant is deliberately not a plan default — it's a vertical-specific module an admin
    turns on per tenant, so tests grant it the same way the Admin Portal would."""
    for key in RESTAURANT_MODULES:
        db_session.add(TenantFeatureFlag(tenant_id=tenant_id, module_key=key, status="enabled"))
    db_session.commit()


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _product(client: TestClient, headers: dict, name: str = "Chicken Biryani", price: float = 220.0) -> dict:
    response = client.post(
        "/api/products",
        json={
            "name": name,
            "identifier_value": f"SKU-{uuid.uuid4().hex[:8]}",
            "cost_price": price / 2,
            "selling_price": price,
            "tax_rate_percent": 0.0,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _setup(client: TestClient, db_session: Session, email: str = "owner@dine.test") -> tuple[dict, dict]:
    auth = _register(client, email=email)
    _enable_restaurant(db_session, auth["tenant"]["id"])
    headers = _headers(auth["access_token"])
    return auth, headers


def _table(client: TestClient, headers: dict, name: str) -> dict:
    response = client.post("/api/restaurant/tables", json={"name": name, "seats": 4}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_restaurant_endpoints_are_gated_until_an_admin_enables_the_module(client: TestClient, db_session: Session):
    auth = _register(client)  # deliberately no feature flags
    response = client.get("/api/restaurant/tables", headers=_headers(auth["access_token"]))
    # 402, not 403 — the app's existing convention for "this feature isn't on your plan"
    # (see FeatureNotAvailableError's handler in app/main.py).
    assert response.status_code == 402


def test_table_and_floor_setup(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)

    floor = client.post("/api/restaurant/floors", json={"name": "Ground Floor"}, headers=headers)
    assert floor.status_code == 200, floor.text
    floor_id = floor.json()["data"]["id"]

    table = client.post(
        "/api/restaurant/tables", json={"name": "Table 1", "floor_id": floor_id, "seats": 6}, headers=headers
    )
    assert table.status_code == 200, table.text
    assert table.json()["data"]["status"] == "available"

    duplicate = client.post("/api/restaurant/tables", json={"name": "Table 1"}, headers=headers)
    assert duplicate.status_code == 400

    # A floor still holding tables can't be silently deleted out from under them.
    assert client.delete(f"/api/restaurant/floors/{floor_id}", headers=headers).status_code == 400


def test_full_chain_table_to_order_to_kot_to_invoice(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table 12")
    biryani = _product(client, headers, "Chicken Biryani", 220.0)
    coke = _product(client, headers, "Coke", 40.0)

    order = client.post(
        "/api/restaurant/orders",
        json={
            "order_type": "dine_in",
            "table_id": table["id"],
            "items": [
                {"product_id": biryani["id"], "quantity": 2},
                {"product_id": coke["id"], "quantity": 2},
            ],
        },
        headers=headers,
    )
    assert order.status_code == 200, order.text
    order_data = order.json()["data"]
    assert order_data["order_number"].startswith("ORD-")
    assert order_data["totals"]["total"] == 520.0

    # Selecting the table now shows it occupied, driven by the order rather than set by hand.
    layout = client.get("/api/restaurant/layout", headers=headers).json()["data"]
    board_table = layout[0]["tables"][0]
    assert board_table["status"] == "occupied"
    assert board_table["active_order_id"] == order_data["id"]
    assert board_table["active_order_total"] == 520.0

    kot = client.post(f"/api/restaurant/orders/{order_data['id']}/kot", json={}, headers=headers)
    assert kot.status_code == 200, kot.text
    kot_data = kot.json()["data"]
    assert kot_data["kot_number"].startswith("KOT-")
    assert kot_data["status"] == "pending"
    assert sum(i["quantity"] for i in kot_data["items"]) == 4

    # Everything is now with the kitchen, so a second blind fire has nothing to send.
    assert client.post(f"/api/restaurant/orders/{order_data['id']}/kot", json={}, headers=headers).status_code == 400

    for status in ("preparing", "ready", "served"):
        moved = client.put(f"/api/restaurant/kots/{kot_data['id']}/status", json={"status": status}, headers=headers)
        assert moved.status_code == 200, moved.text
        assert moved.json()["data"]["status"] == status

    billed = client.post(
        f"/api/restaurant/orders/{order_data['id']}/bill",
        json={"payment_method": "upi", "payment_reference": "UPI-4471902233"},
        headers=headers,
    )
    assert billed.status_code == 200, billed.text
    invoice_id = billed.json()["data"]["invoice_id"]

    # The invoice is generated from the order, not as a second independent sale.
    closed = client.get(f"/api/restaurant/orders/{order_data['id']}", headers=headers).json()["data"]
    assert closed["status"] == "billed"
    assert closed["invoice_id"] == invoice_id

    invoice = client.get(f"/api/invoices/{invoice_id}", headers=headers)
    assert invoice.status_code == 200, invoice.text
    assert invoice.json()["data"]["total_amount"] == 520.0
    # The UPI transaction id reaches the invoice, which is what makes the bill reconcilable
    # against a bank statement line later.
    assert invoice.json()["data"]["payment_reference"] == "UPI-4471902233"

    # Billing releases the table back to the floor.
    after = client.get("/api/restaurant/layout", headers=headers).json()["data"]
    assert after[0]["tables"][0]["status"] == "available"
    assert after[0]["tables"][0]["active_order_id"] is None


def test_a_second_order_cannot_open_on_an_occupied_table(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table 3")
    client.post("/api/restaurant/orders", json={"order_type": "dine_in", "table_id": table["id"]}, headers=headers)

    second = client.post(
        "/api/restaurant/orders", json={"order_type": "dine_in", "table_id": table["id"]}, headers=headers
    )
    assert second.status_code == 409


def test_only_newly_added_items_go_on_the_next_kot(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table 7")
    naan = _product(client, headers, "Butter Naan", 60.0)

    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": table["id"], "items": [{"product_id": naan["id"], "quantity": 1}]},
        headers=headers,
    ).json()["data"]
    client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers)

    # A second round of the same item must only send the new quantity to the kitchen.
    client.post(
        f"/api/restaurant/orders/{order['id']}/items",
        json=[{"product_id": naan["id"], "quantity": 2}],
        headers=headers,
    )
    second_kot = client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers)
    assert second_kot.status_code == 200, second_kot.text
    assert sum(i["quantity"] for i in second_kot.json()["data"]["items"]) == 2


def test_cancelling_a_kot_needs_a_reason_and_returns_the_items_to_unsent(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table 9")
    item = _product(client, headers, "Paneer Tikka", 180.0)
    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": table["id"], "items": [{"product_id": item["id"], "quantity": 1}]},
        headers=headers,
    ).json()["data"]
    kot = client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers).json()["data"]

    # Status updates can't smuggle a cancellation past the reason requirement.
    assert client.put(
        f"/api/restaurant/kots/{kot['id']}/status", json={"status": "cancelled"}, headers=headers
    ).status_code == 400

    cancelled = client.post(
        f"/api/restaurant/kots/{kot['id']}/cancel", json={"reason": "Customer changed their mind"}, headers=headers
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["data"]["cancel_reason"] == "Customer changed their mind"

    # The food is no longer with the kitchen, so it can be fired again.
    refired = client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers)
    assert refired.status_code == 200, refired.text


def test_a_reprint_bumps_the_same_kot_rather_than_creating_a_second_one(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table 11")
    item = _product(client, headers, "Coffee", 90.0)
    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": table["id"], "items": [{"product_id": item["id"], "quantity": 1}]},
        headers=headers,
    ).json()["data"]
    kot = client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers).json()["data"]

    reprinted = client.post(f"/api/restaurant/kots/{kot['id']}/printed", headers=headers)
    assert reprinted.status_code == 200, reprinted.text
    assert reprinted.json()["data"]["print_count"] == 1
    assert len(client.get("/api/restaurant/kots", headers=headers).json()["data"]) == 1


def test_items_already_with_the_kitchen_cannot_be_quietly_removed(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table 4")
    item = _product(client, headers, "Soup", 120.0)
    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": table["id"], "items": [{"product_id": item["id"], "quantity": 2}]},
        headers=headers,
    ).json()["data"]
    client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers)
    line_id = order["items"][0]["id"]

    assert client.delete(f"/api/restaurant/orders/{order['id']}/items/{line_id}", headers=headers).status_code == 400
    # ...nor reduced below what is already cooking.
    assert client.put(
        f"/api/restaurant/orders/{order['id']}/items/{line_id}", json={"quantity": 1}, headers=headers
    ).status_code == 400


def test_transfer_moves_the_order_and_releases_the_old_table(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    source = _table(client, headers, "Table A")
    target = _table(client, headers, "Table B")
    item = _product(client, headers, "Dosa", 100.0)
    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": source["id"], "items": [{"product_id": item["id"], "quantity": 1}]},
        headers=headers,
    ).json()["data"]

    moved = client.post(
        f"/api/restaurant/orders/{order['id']}/transfer", json={"to_table_id": target["id"]}, headers=headers
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["data"]["table_id"] == target["id"]

    tables = {t["name"]: t for t in client.get("/api/restaurant/tables", headers=headers).json()["data"]}
    assert tables["Table A"]["status"] == "available"
    assert tables["Table B"]["status"] == "occupied"


def test_merge_moves_items_onto_one_order_and_frees_the_other_table(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    first = _table(client, headers, "Table M1")
    second = _table(client, headers, "Table M2")
    item = _product(client, headers, "Pizza", 300.0)

    keep = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": first["id"], "items": [{"product_id": item["id"], "quantity": 1}]},
        headers=headers,
    ).json()["data"]
    absorb = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": second["id"], "items": [{"product_id": item["id"], "quantity": 2}]},
        headers=headers,
    ).json()["data"]

    merged = client.post(
        f"/api/restaurant/orders/{keep['id']}/merge", json={"source_order_ids": [absorb["id"]]}, headers=headers
    )
    assert merged.status_code == 200, merged.text
    assert merged.json()["data"]["totals"]["total"] == 900.0

    absorbed = client.get(f"/api/restaurant/orders/{absorb['id']}", headers=headers).json()["data"]
    assert absorbed["status"] == "merged"
    assert absorbed["merged_into_order_id"] == keep["id"]

    tables = {t["name"]: t for t in client.get("/api/restaurant/tables", headers=headers).json()["data"]}
    assert tables["Table M2"]["status"] == "available"


def test_split_moves_selected_quantities_onto_a_new_order(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table S1")
    target = _table(client, headers, "Table S2")
    item = _product(client, headers, "Burger", 150.0)

    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": table["id"], "items": [{"product_id": item["id"], "quantity": 4}]},
        headers=headers,
    ).json()["data"]
    line_id = order["items"][0]["id"]

    split = client.post(
        f"/api/restaurant/orders/{order['id']}/split",
        json={"items": [{"order_item_id": line_id, "quantity": 1}], "to_table_id": target["id"]},
        headers=headers,
    )
    assert split.status_code == 200, split.text
    assert split.json()["data"]["totals"]["total"] == 150.0

    remaining = client.get(f"/api/restaurant/orders/{order['id']}", headers=headers).json()["data"]
    assert remaining["totals"]["total"] == 450.0


def test_takeaway_needs_no_table(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    item = _product(client, headers, "Sandwich", 80.0)
    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "takeaway", "items": [{"product_id": item["id"], "quantity": 1}]},
        headers=headers,
    )
    assert order.status_code == 200, order.text
    assert order.json()["data"]["table_id"] is None

    # A dine-in order without one, though, is a mistake worth catching.
    assert client.post("/api/restaurant/orders", json={"order_type": "dine_in"}, headers=headers).status_code == 400


def test_a_billed_order_can_no_longer_be_changed(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table Z")
    item = _product(client, headers, "Tea", 30.0)
    order = client.post(
        "/api/restaurant/orders",
        json={"order_type": "dine_in", "table_id": table["id"], "items": [{"product_id": item["id"], "quantity": 1}]},
        headers=headers,
    ).json()["data"]
    client.post(f"/api/restaurant/orders/{order['id']}/bill", json={"payment_method": "cash"}, headers=headers)

    added = client.post(
        f"/api/restaurant/orders/{order['id']}/items", json=[{"product_id": item["id"], "quantity": 1}], headers=headers
    )
    assert added.status_code == 400


def test_a_table_with_a_live_order_cannot_be_marked_reserved_or_deleted(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table R")
    client.post("/api/restaurant/orders", json={"order_type": "dine_in", "table_id": table["id"]}, headers=headers)

    assert client.put(
        f"/api/restaurant/tables/{table['id']}/status", json={"status": "reserved"}, headers=headers
    ).status_code == 400
    assert client.delete(f"/api/restaurant/tables/{table['id']}", headers=headers).status_code == 400


def test_reserved_and_cleaning_are_staff_choices_that_survive(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table Q")

    for status in ("reserved", "cleaning", "available"):
        response = client.put(
            f"/api/restaurant/tables/{table['id']}/status", json={"status": status}, headers=headers
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["status"] == status

    # `occupied` is a consequence of an order, never something the board sets directly.
    assert client.put(
        f"/api/restaurant/tables/{table['id']}/status", json={"status": "occupied"}, headers=headers
    ).status_code == 422


def test_quick_bill_attributes_a_counter_sale_to_its_table(client: TestClient, db_session: Session):
    """Billing a cart straight to a table from the POS screen has to leave the same trail as the
    table-board flow, or table-wise reporting silently misses every sale rung up at the counter."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table Q")
    item = _product(client, headers, "Dosa", 100.0)

    billed = client.post(
        "/api/restaurant/tables/quick-bill",
        json={
            "table_id": table["id"],
            "items": [{"product_id": item["id"], "quantity": 2}],
            "payment_method": "upi",
            "payment_reference": "UPI-QB-1",
        },
        headers=headers,
    )
    assert billed.status_code == 200, billed.text
    invoice_id = billed.json()["data"]["invoice_id"]

    # A real order exists behind it, closed and pointing at the invoice.
    orders = client.get("/api/restaurant/orders?status=billed", headers=headers).json()["data"]
    assert any(o["table_id"] == table["id"] and o["invoice_id"] == invoice_id for o in orders)

    # And the table is free again, not stranded as occupied.
    layout = client.get("/api/restaurant/layout", headers=headers).json()["data"]
    billed_table = [t for group in layout for t in group["tables"] if t["id"] == table["id"]][0]
    assert billed_table["active_order_id"] is None

    invoice = client.get(f"/api/invoices/{invoice_id}", headers=headers).json()["data"]
    assert invoice["payment_reference"] == "UPI-QB-1"


def test_quick_bill_adds_to_a_running_tab_instead_of_opening_a_second_order(
    client: TestClient, db_session: Session
):
    """Two live orders on one table is the bug the table board already prevents; ringing extra
    items up at the counter must not sneak around it."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table T")
    item = _product(client, headers, "Coffee", 50.0)

    opened = client.post(
        f"/api/restaurant/tables/{table['id']}/order",
        json=[{"product_id": item["id"], "quantity": 1}],
        headers=headers,
    )
    assert opened.status_code == 200, opened.text
    order_id = opened.json()["data"]["id"]

    billed = client.post(
        "/api/restaurant/tables/quick-bill",
        json={
            "table_id": table["id"],
            "items": [{"product_id": item["id"], "quantity": 2}],
            "payment_method": "cash",
        },
        headers=headers,
    )
    assert billed.status_code == 200, billed.text

    # Same order, billed once, carrying all three units — not a second order.
    orders = client.get("/api/restaurant/orders", headers=headers).json()["data"]
    for_table = [o for o in orders if o["table_id"] == table["id"]]
    assert len(for_table) == 1
    assert for_table[0]["id"] == order_id
    assert sum(i["quantity"] for i in for_table[0]["items"]) == 3


def test_opening_a_table_order_twice_reuses_the_same_tab(client: TestClient, db_session: Session):
    """A table sends several rounds to the kitchen across one sitting; they all belong on one bill."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table R2")
    item = _product(client, headers, "Naan", 40.0)

    first = client.post(
        f"/api/restaurant/tables/{table['id']}/order",
        json=[{"product_id": item["id"], "quantity": 1}],
        headers=headers,
    ).json()["data"]
    second = client.post(
        f"/api/restaurant/tables/{table['id']}/order",
        json=[{"product_id": item["id"], "quantity": 2}],
        headers=headers,
    ).json()["data"]

    assert second["id"] == first["id"]
    assert sum(i["quantity"] for i in second["items"]) == 3


def test_opening_a_table_never_creates_a_second_order(client: TestClient, db_session: Session):
    """The core of Billing/Tables sync: both screens resolve to one order per table. Opening the
    same table repeatedly must not mint ORD-000013, ORD-000014, ... behind the cashier."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table S1")
    item = _product(client, headers, "Juice", 120.0)

    ids = set()
    for _ in range(3):
        opened = client.post(
            f"/api/restaurant/tables/{table['id']}/order",
            json=[{"product_id": item["id"], "quantity": 1}],
            headers=headers,
        )
        assert opened.status_code == 200, opened.text
        ids.add(opened.json()["data"]["id"])

    assert len(ids) == 1
    active = client.get(f"/api/restaurant/tables/{table['id']}/active-order", headers=headers).json()["data"]
    assert active["id"] == ids.pop()
    assert sum(i["quantity"] for i in active["items"]) == 3


def test_a_free_table_reports_no_active_order(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table S2")
    # make_response omits `data` entirely when it is None — the app-wide convention.
    assert client.get(f"/api/restaurant/tables/{table['id']}/active-order", headers=headers).json().get("data") is None


def test_releasing_an_empty_table_frees_it_without_deleting_it(client: TestClient, db_session: Session):
    """Release frees the occupancy, never the table configuration."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table S3")
    client.post(f"/api/restaurant/tables/{table['id']}/order", json=[], headers=headers)

    released = client.post(f"/api/restaurant/tables/{table['id']}/release", json={}, headers=headers)
    assert released.status_code == 200, released.text
    assert released.json()["data"]["status"] == "available"

    # The table itself still exists.
    tables = client.get("/api/restaurant/tables", headers=headers).json()["data"]
    assert any(t["id"] == table["id"] for t in tables)


def test_a_table_with_items_is_not_released_without_confirmation(client: TestClient, db_session: Session):
    """Never lose a customer's order to a stray click."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table S4")
    item = _product(client, headers, "Biryani", 220.0)
    client.post(
        f"/api/restaurant/tables/{table['id']}/order",
        json=[{"product_id": item["id"], "quantity": 2}],
        headers=headers,
    )

    refused = client.post(f"/api/restaurant/tables/{table['id']}/release", json={}, headers=headers)
    assert refused.status_code == 409

    confirmed = client.post(
        f"/api/restaurant/tables/{table['id']}/release", json={"cancel_order": True}, headers=headers
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["data"]["status"] == "available"


def test_a_table_with_kitchen_tickets_cannot_be_released_at_all(client: TestClient, db_session: Session):
    """The food is already being cooked — releasing the table would strand it, so the KOTs have to
    be cancelled through their own flow, where a reason is recorded."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table S5")
    item = _product(client, headers, "Dosa", 100.0)
    order = client.post(
        f"/api/restaurant/tables/{table['id']}/order",
        json=[{"product_id": item["id"], "quantity": 1}],
        headers=headers,
    ).json()["data"]
    client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers)

    refused = client.post(
        f"/api/restaurant/tables/{table['id']}/release", json={"cancel_order": True}, headers=headers
    )
    assert refused.status_code == 409
    assert "kitchen ticket" in refused.json()["detail"].lower()


def test_a_table_whose_food_was_served_can_be_released(client: TestClient, db_session: Session):
    """A served ticket has left the kitchen and no longer shows on the board, so it must not keep
    the table hostage — blocking on it meant a finished table could never be cleared while the
    kitchen screen sat empty."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table S5b")
    item = _product(client, headers, "Idli", 60.0)
    order = client.post(
        f"/api/restaurant/tables/{table['id']}/order",
        json=[{"product_id": item["id"], "quantity": 1}],
        headers=headers,
    ).json()["data"]
    kot = client.post(f"/api/restaurant/orders/{order['id']}/kot", json={}, headers=headers).json()["data"]
    served = client.put(f"/api/restaurant/kots/{kot['id']}/status", json={"status": "served"}, headers=headers)
    assert served.status_code == 200, served.text

    released = client.post(
        f"/api/restaurant/tables/{table['id']}/release", json={"cancel_order": True}, headers=headers
    )
    assert released.status_code == 200, released.text
    assert released.json()["data"]["status"] == "available"

    # ...and the kitchen has nothing left showing for it.
    board = client.get("/api/restaurant/kots", headers=headers).json()["data"]
    assert [k for k in board if k["order_id"] == order["id"] and k["status"] in ("pending", "preparing", "ready")] == []


def test_table_messages_never_say_table_twice(client: TestClient, db_session: Session):
    """Restaurants name tables both ways. "Table 4" must not be read back as "Table Table 4", and a
    table named just "7" still has to read as a table in a sentence."""
    _, headers = _setup(client, db_session)
    item = _product(client, headers, "Vada", 40.0)

    prefixed = _table(client, headers, "Table S5c")
    client.post(
        f"/api/restaurant/tables/{prefixed['id']}/order",
        json=[{"product_id": item["id"], "quantity": 1}],
        headers=headers,
    )
    detail = client.post(f"/api/restaurant/tables/{prefixed['id']}/release", json={}, headers=headers).json()["detail"]
    assert "Table Table" not in detail
    assert detail.startswith("Table S5c ")

    bare = _table(client, headers, "S5d")
    client.post(
        f"/api/restaurant/tables/{bare['id']}/order",
        json=[{"product_id": item["id"], "quantity": 1}],
        headers=headers,
    )
    bare_detail = client.post(f"/api/restaurant/tables/{bare['id']}/release", json={}, headers=headers).json()["detail"]
    assert bare_detail.startswith("Table S5d ")


def test_billing_a_table_order_releases_the_table(client: TestClient, db_session: Session):
    """Checkout from either screen ends the same way: invoice created, order closed, table free."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Table S6")
    item = _product(client, headers, "Coffee", 50.0)
    order = client.post(
        f"/api/restaurant/tables/{table['id']}/order",
        json=[{"product_id": item["id"], "quantity": 2}],
        headers=headers,
    ).json()["data"]

    billed = client.post(
        f"/api/restaurant/orders/{order['id']}/bill", json={"payment_method": "cash"}, headers=headers
    )
    assert billed.status_code == 200, billed.text

    assert client.get(f"/api/restaurant/tables/{table['id']}/active-order", headers=headers).json().get("data") is None
    # The order is kept as history, not deleted.
    closed = client.get(f"/api/restaurant/orders/{order['id']}", headers=headers).json()["data"]
    assert closed["status"] == "billed"
    assert closed["invoice_id"] == billed.json()["data"]["invoice_id"]


def test_billing_a_tab_as_unpaid_without_a_customer_explains_itself(
    client: TestClient, db_session: Session
):
    """A running tab settled later is ordinary restaurant work, and the sales layer rightly
    insists an unpaid bill names who owes it. That rule reaching the cashier as a 500 is not
    ordinary: only RestaurantError was translated here, so every money rule the sales layer
    enforces — credit limits, manager approval, this one — surfaced as Internal Server Error.
    """
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Credit Table")
    item = _product(client, headers, "Dosa", 100.0)
    order = client.post(
        f"/api/restaurant/tables/{table['id']}/order",
        json=[{"product_id": item["id"], "quantity": 2}],
        headers=headers,
    ).json()["data"]

    refused = client.post(
        f"/api/restaurant/orders/{order['id']}/bill",
        json={"payment_method": "cash", "mark_paid": False},
        headers=headers,
    )
    assert refused.status_code == 400, refused.text
    assert "customer" in refused.json()["detail"].lower()

    # The tab is untouched, so the cashier can pick a customer and bill it properly.
    still_open = client.get(f"/api/restaurant/orders/{order['id']}", headers=headers).json()["data"]
    assert still_open["status"] == "open"


def test_a_tab_with_a_customer_bills_as_unpaid_and_lands_in_outstanding(
    client: TestClient, db_session: Session
):
    """The running-tab case the feature exists for: bill it to a customer now, collect later."""
    _, headers = _setup(client, db_session)
    table = _table(client, headers, "Tab Table")
    item = _product(client, headers, "Dosa", 100.0)
    customer = client.post(
        "/api/customers", json={"name": "Regular Guest", "phone": "9876500011"}, headers=headers
    ).json()["data"]
    order = client.post(
        "/api/restaurant/orders",
        json={
            "order_type": "dine_in",
            "table_id": table["id"],
            "customer_id": customer["id"],
            "items": [{"product_id": item["id"], "quantity": 2}],
        },
        headers=headers,
    ).json()["data"]

    billed = client.post(
        f"/api/restaurant/orders/{order['id']}/bill",
        json={"payment_method": "cash", "mark_paid": False, "due_date": "2026-12-31"},
        headers=headers,
    )
    assert billed.status_code == 200, billed.text
    invoice = client.get(f"/api/invoices/{billed.json()['data']['invoice_id']}", headers=headers).json()["data"]
    assert invoice["payment_status"] != "paid"
    assert invoice["outstanding_amount"] > 0
    # And the table is free again — the food is served, the money is owed, not the table.
    assert client.get(f"/api/restaurant/tables/{table['id']}/active-order", headers=headers).json().get("data") is None
