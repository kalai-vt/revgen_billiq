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
    payload = {"name": "Widget", "identifier_value": "WID-1", "cost_price": 5.0, "selling_price": 20.0}
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _csv_bytes(headers: list[str], rows: list[list[str]]) -> bytes:
    lines = [",".join(headers)]
    for row in rows:
        lines.append(",".join(row))
    return ("\n".join(lines)).encode("utf-8")


def _upload_csv(client: TestClient, headers: dict, filename: str, content: bytes):
    return client.post("/api/products/imports", files={"file": (filename, content, "text/csv")}, headers=headers)


def test_download_template_returns_xlsx(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    response = client.get("/api/products/import-template", headers=headers)
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers["content-type"]
    assert len(response.content) > 0


def test_upload_exact_template_headers_auto_maps_and_validates(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(
        ["Product Name", "Identifier (PID/SKU)", "Category", "Cost Price", "Selling Price", "Tax %", "Barcode"],
        [["New Gadget", "GAD-1", "", "10", "25", "18", ""]],
    )
    response = _upload_csv(client, headers, "template.csv", content)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_mapping"] is False
    assert data["status"] == "validated"

    rows = client.get(f"/api/products/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["total"] == 1
    assert rows["ready_count"] == 1
    row = rows["items"][0]
    assert row["status"] == "ready"
    assert row["matched_product_id"] is None  # new product, not matched


def test_upload_with_renamed_headers_requires_mapping(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Item", "Code", "Rate"], [["Gadget", "GAD-1", "25"]])
    response = _upload_csv(client, headers, "supplier.csv", content)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_mapping"] is True
    assert data["status"] == "mapping_required"

    mapping_response = client.put(
        f"/api/products/imports/{data['import_id']}/mapping",
        json={"mapping": {"name": "Item", "identifier_value": "Code", "selling_price": "Rate"}},
        headers=headers,
    )
    assert mapping_response.status_code == 200
    assert mapping_response.json()["data"]["ready_count"] == 1


def test_confirm_creates_new_products(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(
        ["Product Name", "Identifier (PID/SKU)", "Cost Price", "Selling Price", "Tax %"],
        [["New Gadget", "GAD-1", "10", "25", "18"]],
    )
    upload = _upload_csv(client, headers, "template.csv", content)
    import_id = upload.json()["data"]["import_id"]

    confirm = client.post(f"/api/products/imports/{import_id}/confirm", headers=headers)
    assert confirm.status_code == 200
    result = confirm.json()["data"]
    assert result["rows_imported"] == 1
    assert result["rows_failed"] == 0
    assert result["status"] == "completed"

    products = client.get("/api/products?q=New Gadget", headers=headers).json()["data"]["items"]
    assert len(products) == 1
    assert products[0]["identifier_value"] == "GAD-1"
    assert products[0]["selling_price"] == 25.0


def test_confirm_updates_existing_matched_product(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_product(client, headers, name="Widget", identifier_value="WID-1", selling_price=20.0)

    content = _csv_bytes(
        ["Product Name", "Identifier (PID/SKU)", "Selling Price"],
        [["Widget Updated", "WID-1", "35"]],
    )
    upload = _upload_csv(client, headers, "template.csv", content)
    data = upload.json()["data"]
    assert data["status"] == "validated"

    rows = client.get(f"/api/products/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["items"][0]["matched_product_id"] is not None

    confirm = client.post(f"/api/products/imports/{data['import_id']}/confirm", headers=headers)
    assert confirm.status_code == 200
    assert confirm.json()["data"]["rows_imported"] == 1

    products = client.get("/api/products?q=WID-1", headers=headers).json()["data"]["items"]
    assert len(products) == 1
    assert products[0]["name"] == "Widget Updated"
    assert products[0]["selling_price"] == 35.0


def test_missing_name_errors(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Product Name", "Identifier (PID/SKU)"], [["", "GAD-1"]])
    upload = _upload_csv(client, headers, "bad.csv", content)
    data = upload.json()["data"]
    rows = client.get(f"/api/products/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["error_count"] == 1
    assert "name" in rows["items"][0]["error_messages"][0].lower()


def test_duplicate_identifier_within_file_errors(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(
        ["Product Name", "Identifier (PID/SKU)"],
        [["Gadget One", "DUP-1"], ["Gadget Two", "DUP-1"]],
    )
    upload = _upload_csv(client, headers, "dup.csv", content)
    data = upload.json()["data"]
    rows = client.get(f"/api/products/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["error_count"] == 1
    assert rows["ready_count"] == 1


def test_barcode_conflict_errors(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=headers)
    _create_product(client, headers, name="Existing", identifier_value="EX-1", barcode="1234567890123")

    content = _csv_bytes(
        ["Product Name", "Identifier (PID/SKU)", "Barcode"],
        [["New One", "NEW-1", "1234567890123"]],
    )
    upload = _upload_csv(client, headers, "barcode.csv", content)
    data = upload.json()["data"]
    rows = client.get(f"/api/products/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["error_count"] == 1


def test_unknown_category_is_warning_not_error(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(
        ["Product Name", "Identifier (PID/SKU)", "Category"],
        [["Gadget", "GAD-1", "Nonexistent Category"]],
    )
    upload = _upload_csv(client, headers, "cat.csv", content)
    data = upload.json()["data"]
    rows = client.get(f"/api/products/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["warning_count"] == 1
    assert rows["error_count"] == 0


def test_row_can_be_edited_and_reskipped(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Product Name", "Identifier (PID/SKU)"], [["", "GAD-1"]])
    upload = _upload_csv(client, headers, "edit.csv", content)
    data = upload.json()["data"]
    row_id = client.get(f"/api/products/imports/{data['import_id']}/rows", headers=headers).json()["data"]["items"][0]["id"]

    patched = client.patch(
        f"/api/products/imports/{data['import_id']}/rows/{row_id}",
        json={"name": "Fixed Name"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["data"]["status"] == "ready"

    skip = client.patch(
        f"/api/products/imports/{data['import_id']}/rows/{row_id}",
        json={"is_skipped": True},
        headers=headers,
    )
    assert skip.json()["data"]["is_skipped"] is True


def test_import_history_lists_completed_import(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Product Name", "Identifier (PID/SKU)"], [["Gadget", "GAD-1"]])
    upload = _upload_csv(client, headers, "history.csv", content)
    import_id = upload.json()["data"]["import_id"]
    client.post(f"/api/products/imports/{import_id}/confirm", headers=headers)

    history = client.get("/api/products/imports", headers=headers).json()["data"]
    assert history["total"] == 1
    assert history["items"][0]["status"] == "completed"


def test_error_report_csv_download(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Product Name", "Identifier (PID/SKU)"], [["", "GAD-1"]])
    upload = _upload_csv(client, headers, "err.csv", content)
    import_id = upload.json()["data"]["import_id"]

    response = client.get(f"/api/products/imports/{import_id}/error-report", headers=headers)
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert b"name" in response.content.lower() or b"required" in response.content.lower()


def test_staff_cannot_access_import_endpoints(client: TestClient) -> None:
    owner = _register(client)
    owner_headers = _headers(owner["access_token"])
    client.put("/api/settings", json={"plan": "explore"}, headers=owner_headers)
    client.post(
        "/api/auth/team",
        json={"first_name": "Sam", "last_name": "Staff", "email": "staff@acme.test", "password": "StaffPass!123", "role": "staff"},
        headers=owner_headers,
    )
    login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    staff_headers = _headers(login.json()["data"]["access_token"])

    content = _csv_bytes(["Product Name", "Identifier (PID/SKU)"], [["Gadget", "GAD-1"]])
    response = _upload_csv(client, staff_headers, "x.csv", content)
    assert response.status_code == 403
