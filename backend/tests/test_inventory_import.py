from __future__ import annotations

import io

from fastapi.testclient import TestClient
from openpyxl import Workbook
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


def _csv_bytes(headers: list[str], rows: list[list[str]]) -> bytes:
    lines = [",".join(headers)]
    for row in rows:
        lines.append(",".join(row))
    return ("\n".join(lines)).encode("utf-8")


def _upload_csv(client: TestClient, headers: dict, filename: str, content: bytes) -> dict:
    response = client.post(
        "/api/inventory/imports",
        files={"file": (filename, content, "text/csv")},
        headers=headers,
    )
    return response


def test_download_template_returns_xlsx(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    response = client.get("/api/inventory/import-template", headers=headers)
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers["content-type"]
    assert len(response.content) > 0


def test_upload_exact_template_headers_auto_maps_and_validates(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(
        ["Product ID (PID)", "SKU (Optional)", "Product Name", "Category", "Quantity", "Cost Price", "Selling Price", "Tax %", "Notes"],
        [["WID-1", "", "Widget", "", "25", "5", "10", "18", "Initial load"]],
    )
    response = _upload_csv(client, headers, "template.csv", content)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_mapping"] is False
    assert data["status"] == "validated"

    rows = client.get(f"/api/inventory/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["total"] == 1
    assert rows["ready_count"] == 1
    row = rows["items"][0]
    assert row["status"] == "ready"
    assert row["quantity"] == 25
    assert row["matched_product_id"] is not None


def test_upload_with_renamed_headers_requires_mapping(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(
        ["Barcode/Code", "Item Description", "Units", "Rate"],
        [["WID-1", "Widget", "30", "12"]],
    )
    response = _upload_csv(client, headers, "supplier.csv", content)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_mapping"] is True
    assert data["status"] == "mapping_required"

    mapping_response = client.put(
        f"/api/inventory/imports/{data['import_id']}/mapping",
        json={"mapping": {"pid": "Barcode/Code", "quantity": "Units", "selling_price": "Rate", "product_name": "Item Description"}},
        headers=headers,
    )
    assert mapping_response.status_code == 200
    result = mapping_response.json()["data"]
    assert result["status"] == "validated"
    assert result["items"][0]["quantity"] == 30
    assert result["items"][0]["selling_price"] == 12


def test_missing_required_columns_rejected(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Notes"], [["just a note"]])
    response = _upload_csv(client, headers, "bad.csv", content)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_mapping"] is True

    mapping_response = client.put(
        f"/api/inventory/imports/{data['import_id']}/mapping",
        json={"mapping": {"notes": "Notes"}},
        headers=headers,
    )
    assert mapping_response.status_code == 400


def test_product_not_found_marks_row_error(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(
        ["Product ID (PID)", "Quantity"],
        [["DOES-NOT-EXIST", "10"]],
    )
    response = _upload_csv(client, headers, "missing.csv", content)
    data = response.json()["data"]
    rows = client.get(f"/api/inventory/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["error_count"] == 1
    assert "not found" in rows["items"][0]["error_messages"][0].lower()


def test_duplicate_identifier_within_file_marks_later_row_error(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(
        ["Product ID (PID)", "Quantity"],
        [["WID-1", "10"], ["WID-1", "20"]],
    )
    response = _upload_csv(client, headers, "dup.csv", content)
    data = response.json()["data"]
    rows = client.get(f"/api/inventory/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    # First occurrence of an identifier resolves normally (warning only, since
    # prices/tax weren't provided in this file); later occurrences of the same
    # identifier in the same file are rejected as duplicates.
    assert rows["items"][0]["status"] in ("ready", "warning")
    assert rows["items"][1]["status"] == "error"
    assert "duplicate" in rows["items"][1]["error_messages"][0].lower()


def test_invalid_quantity_price_and_tax_marked_error(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(
        ["Product ID (PID)", "Quantity", "Cost Price", "Selling Price", "Tax %"],
        [["WID-1", "not-a-number", "abc", "-5", "150"]],
    )
    response = _upload_csv(client, headers, "invalid.csv", content)
    data = response.json()["data"]
    rows = client.get(f"/api/inventory/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    row = rows["items"][0]
    assert row["status"] == "error"
    messages = " ".join(row["error_messages"]).lower()
    assert "quantity" in messages
    assert "cost price" in messages
    assert "negative" in messages or "selling price" in messages
    assert "tax" in messages


def test_blank_optional_fields_marked_warning_not_error(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(
        ["Product ID (PID)", "Quantity", "Cost Price", "Selling Price", "Tax %"],
        [["WID-1", "15", "", "", ""]],
    )
    response = _upload_csv(client, headers, "warn.csv", content)
    data = response.json()["data"]
    rows = client.get(f"/api/inventory/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["warning_count"] == 1
    assert rows["items"][0]["status"] == "warning"


def test_empty_rows_are_skipped_silently(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(
        ["Product ID (PID)", "Quantity"],
        [["WID-1", "10"], ["", ""], ["  ", ""]],
    )
    response = _upload_csv(client, headers, "blank.csv", content)
    data = response.json()["data"]
    assert data["rows_total"] == 1


def test_full_confirm_updates_inventory_and_prices_and_creates_history(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers, identifier_value="WID-1", cost_price=5.0, selling_price=20.0)

    content = _csv_bytes(
        ["Product ID (PID)", "Quantity", "Cost Price", "Selling Price", "Tax %"],
        [["WID-1", "40", "6", "22", "12"]],
    )
    upload = _upload_csv(client, headers, "confirm.csv", content)
    import_id = upload.json()["data"]["import_id"]

    confirm = client.post(f"/api/inventory/imports/{import_id}/confirm", headers=headers)
    assert confirm.status_code == 200
    result = confirm.json()["data"]
    assert result["rows_imported"] == 1
    assert result["rows_failed"] == 0
    assert result["status"] == "completed"

    inv = client.get("/api/inventory", params={"q": "Widget"}, headers=headers).json()["data"]["items"][0]
    assert inv["quantity"] == 40
    assert inv["cost_price"] == 6
    assert inv["selling_price"] == 22
    assert inv["tax_rate_percent"] == 12

    history = client.get("/api/inventory/stock-history", headers=headers).json()["data"]["items"]
    import_row = next(row for row in history if row["reason"] == "bulk_import")
    assert import_row["source"] == "import"
    assert import_row["added"] == 40

    import_history = client.get("/api/inventory/imports", headers=headers).json()["data"]
    assert import_history["items"][0]["rows_imported"] == 1
    assert import_history["items"][0]["status"] == "completed"


def test_confirm_with_error_rows_is_partial_and_excludes_them(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(
        ["Product ID (PID)", "Quantity"],
        [["WID-1", "10"], ["MISSING-1", "5"]],
    )
    upload = _upload_csv(client, headers, "partial.csv", content)
    import_id = upload.json()["data"]["import_id"]

    confirm = client.post(f"/api/inventory/imports/{import_id}/confirm", headers=headers)
    result = confirm.json()["data"]
    assert result["status"] == "partial"
    assert result["rows_imported"] == 1
    assert result["rows_failed"] == 1


def test_skip_row_excludes_it_from_confirm(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(["Product ID (PID)", "Quantity"], [["WID-1", "10"]])
    upload = _upload_csv(client, headers, "skip.csv", content)
    import_id = upload.json()["data"]["import_id"]
    rows = client.get(f"/api/inventory/imports/{import_id}/rows", headers=headers).json()["data"]
    row_id = rows["items"][0]["id"]

    patch = client.patch(f"/api/inventory/imports/{import_id}/rows/{row_id}", json={"is_skipped": True}, headers=headers)
    assert patch.status_code == 200

    confirm = client.post(f"/api/inventory/imports/{import_id}/confirm", headers=headers)
    result = confirm.json()["data"]
    assert result["rows_skipped"] == 1
    assert result["rows_imported"] == 0


def test_edit_row_value_before_confirm_is_applied(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    content = _csv_bytes(["Product ID (PID)", "Quantity"], [["WID-1", "10"]])
    upload = _upload_csv(client, headers, "edit.csv", content)
    import_id = upload.json()["data"]["import_id"]
    rows = client.get(f"/api/inventory/imports/{import_id}/rows", headers=headers).json()["data"]
    row_id = rows["items"][0]["id"]

    patch = client.patch(f"/api/inventory/imports/{import_id}/rows/{row_id}", json={"quantity": 99}, headers=headers)
    assert patch.status_code == 200
    assert patch.json()["data"]["quantity"] == 99

    confirm = client.post(f"/api/inventory/imports/{import_id}/confirm", headers=headers)
    assert confirm.json()["data"]["rows_imported"] == 1
    inv = client.get("/api/inventory", headers=headers).json()["data"]["items"][0]
    assert inv["quantity"] == 99


def test_error_report_download_lists_failed_rows(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Product ID (PID)", "Quantity"], [["MISSING-1", "5"]])
    upload = _upload_csv(client, headers, "errors.csv", content)
    import_id = upload.json()["data"]["import_id"]

    report = client.get(f"/api/inventory/imports/{import_id}/error-report", headers=headers)
    assert report.status_code == 200
    assert "text/csv" in report.headers["content-type"]
    assert "MISSING-1" in report.text


def test_staff_cannot_upload_import(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    staff = _create_staff(client, admin_db_session, owner, owner_headers)
    staff_headers = _headers(staff["access_token"])

    content = _csv_bytes(["Product ID (PID)", "Quantity"], [["WID-1", "10"]])
    response = _upload_csv(client, staff_headers, "denied.csv", content)
    assert response.status_code == 403


def test_upload_xlsx_file_parses_correctly(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, identifier_value="WID-1")

    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Product ID (PID)", "Quantity", "Selling Price"])
    sheet.append(["WID-1", 15, 25])
    buffer = io.BytesIO()
    workbook.save(buffer)

    response = client.post(
        "/api/inventory/imports",
        files={"file": ("upload.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["source_type"] == "excel"
    rows = client.get(f"/api/inventory/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["items"][0]["quantity"] == 15
