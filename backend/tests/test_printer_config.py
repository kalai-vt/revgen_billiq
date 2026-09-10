"""KOT printer configuration.

The rule these tests exist to protect: the app must never claim a printer is connected without
having reached it. A configuration screen that reports "Connected" because someone filled in a
form teaches staff to trust a signal that means nothing.
"""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.test_restaurant import _setup


def test_kot_printer_starts_unconfigured_and_disabled(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    config = client.get("/api/printing/config/kot", headers=headers)
    assert config.status_code == 200, config.text
    data = config.json()["data"]
    assert data["enabled"] is False
    assert data["connection_status"] == "unconfigured"
    # Every ticket toggle comes back populated, so the client never has to guess a missing one.
    assert set(data["ticket_fields"]) >= {"restaurant_name", "table_number", "kot_number"}


def test_saving_a_configuration_never_reports_connected(client: TestClient, db_session: Session):
    """Filling in a form proves nothing about whether a printer exists on the other end."""
    _, headers = _setup(client, db_session)
    saved = client.put(
        "/api/printing/config/kot",
        json={"enabled": True, "connection_type": "usb", "printer_name": "Kitchen Printer"},
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["data"]["connection_status"] == "untested"


def test_a_successful_test_is_what_makes_it_connected(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    client.put(
        "/api/printing/config/kot",
        json={"enabled": True, "connection_type": "usb", "printer_name": "Kitchen Printer"},
        headers=headers,
    )
    tested = client.post("/api/printing/config/kot/test-result", json={"ok": True}, headers=headers)
    assert tested.status_code == 200, tested.text
    data = tested.json()["data"]
    assert data["connection_status"] == "connected"
    assert data["last_tested_at"] is not None
    assert data["last_test_error"] is None


def test_a_failed_test_records_why(client: TestClient, db_session: Session):
    _, headers = _setup(client, db_session)
    client.put(
        "/api/printing/config/kot",
        json={"enabled": True, "connection_type": "usb", "printer_name": "Kitchen Printer"},
        headers=headers,
    )
    failed = client.post(
        "/api/printing/config/kot/test-result",
        json={"ok": False, "error": "Printer is offline."},
        headers=headers,
    )
    data = failed.json()["data"]
    assert data["connection_status"] == "failed"
    # A generic "something went wrong" is exactly what this replaces.
    assert data["last_test_error"] == "Printer is offline."


def test_changing_where_the_printer_lives_invalidates_a_past_success(client: TestClient, db_session: Session):
    """Otherwise the screen keeps showing Connected for a device nobody has reached since the
    address changed."""
    _, headers = _setup(client, db_session)
    client.put(
        "/api/printing/config/kot",
        json={"enabled": True, "connection_type": "usb", "printer_name": "Kitchen Printer"},
        headers=headers,
    )
    client.post("/api/printing/config/kot/test-result", json={"ok": True}, headers=headers)

    moved = client.put("/api/printing/config/kot", json={"printer_name": "Other Printer"}, headers=headers)
    assert moved.json()["data"]["connection_status"] == "untested"
    assert moved.json()["data"]["last_tested_at"] is None


def test_a_typo_in_the_ip_is_rejected_at_the_door(client: TestClient, db_session: Session):
    """A bad address is a printer that silently never prints — better caught here than at 8pm."""
    _, headers = _setup(client, db_session)
    bad = client.put(
        "/api/printing/config/kot",
        json={"enabled": True, "connection_type": "lan", "ip_address": "192.168.1", "port": 9100},
        headers=headers,
    )
    assert bad.status_code == 422, bad.text


def test_printer_configuration_is_tenant_isolated(client: TestClient, db_session: Session):
    """One restaurant must never see or use another restaurant's printer."""
    _, headers_a = _setup(client, db_session)
    client.put(
        "/api/printing/config/kot",
        json={"enabled": True, "connection_type": "usb", "printer_name": "Tenant A Kitchen"},
        headers=headers_a,
    )

    _, headers_b = _setup(client, db_session, email="second@example.com")
    other = client.get("/api/printing/config/kot", headers=headers_b).json()["data"]
    assert other["printer_name"] is None
    assert other["enabled"] is False
