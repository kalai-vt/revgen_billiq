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


def _create_customer(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Jane Doe", "mobile": "9998887777"}
    payload.update(overrides)
    response = client.post("/api/customers", json=payload, headers=headers)
    assert response.status_code == 200
    return response.json()["data"]


def _csv_bytes(headers: list[str], rows: list[list[str]]) -> bytes:
    lines = [",".join(headers)]
    for row in rows:
        lines.append(",".join(row))
    return ("\n".join(lines)).encode("utf-8")


def _upload_csv(client: TestClient, headers: dict, filename: str, content: bytes):
    return client.post("/api/customers/imports", files={"file": (filename, content, "text/csv")}, headers=headers)


def test_download_template_returns_xlsx(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    response = client.get("/api/customers/import-template", headers=headers)
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers["content-type"]


def test_upload_exact_template_headers_auto_maps_and_validates(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(
        ["Name", "Mobile", "Email", "Address"],
        [["New Customer", "9112233445", "new@example.com", "42 Main St"]],
    )
    response = _upload_csv(client, headers, "template.csv", content)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["requires_mapping"] is False
    assert data["status"] == "validated"

    rows = client.get(f"/api/customers/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["ready_count"] == 1
    assert rows["items"][0]["matched_customer_id"] is None


def test_upload_missing_contact_columns_requires_mapping(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Customer", "City"], [["Jane", "Springfield"]])
    response = _upload_csv(client, headers, "supplier.csv", content)
    data = response.json()["data"]
    assert data["requires_mapping"] is True


def test_confirm_creates_new_customers(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Name", "Mobile"], [["New Customer", "9112233445"]])
    upload = _upload_csv(client, headers, "template.csv", content)
    import_id = upload.json()["data"]["import_id"]

    confirm = client.post(f"/api/customers/imports/{import_id}/confirm", headers=headers)
    assert confirm.status_code == 200
    result = confirm.json()["data"]
    assert result["rows_imported"] == 1
    assert result["status"] == "completed"

    customers = client.get("/api/customers?q=New Customer", headers=headers).json()["data"]["items"]
    assert len(customers) == 1
    assert customers[0]["mobile"] == "9112233445"


def test_confirm_updates_existing_matched_customer_by_mobile(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    _create_customer(client, headers, name="Jane Doe", mobile="9998887777")

    content = _csv_bytes(["Name", "Mobile"], [["Jane D. Updated", "9998887777"]])
    upload = _upload_csv(client, headers, "template.csv", content)
    data = upload.json()["data"]
    rows = client.get(f"/api/customers/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["items"][0]["matched_customer_id"] is not None

    confirm = client.post(f"/api/customers/imports/{data['import_id']}/confirm", headers=headers)
    assert confirm.json()["data"]["rows_imported"] == 1

    customers = client.get("/api/customers?q=9998887777", headers=headers).json()["data"]["items"]
    assert customers[0]["name"] == "Jane D. Updated"


def test_missing_name_errors(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Name", "Mobile"], [["", "9112233445"]])
    upload = _upload_csv(client, headers, "bad.csv", content)
    data = upload.json()["data"]
    rows = client.get(f"/api/customers/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["error_count"] == 1


def test_duplicate_mobile_within_file_errors(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(
        ["Name", "Mobile"],
        [["Customer One", "9000000001"], ["Customer Two", "9000000001"]],
    )
    upload = _upload_csv(client, headers, "dup.csv", content)
    data = upload.json()["data"]
    rows = client.get(f"/api/customers/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["error_count"] == 1
    assert rows["ready_count"] == 1


def test_missing_contact_is_warning_not_error(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Name", "Mobile", "Email"], [["No Contact Customer", "", ""]])
    response = _upload_csv(client, headers, "nocontact.csv", content)
    data = response.json()["data"]
    assert data["requires_mapping"] is False
    rows = client.get(f"/api/customers/imports/{data['import_id']}/rows", headers=headers).json()["data"]
    assert rows["warning_count"] == 1
    assert rows["error_count"] == 0


def test_import_history_lists_completed_import(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    content = _csv_bytes(["Name", "Mobile"], [["Customer", "9112233445"]])
    upload = _upload_csv(client, headers, "history.csv", content)
    import_id = upload.json()["data"]["import_id"]
    client.post(f"/api/customers/imports/{import_id}/confirm", headers=headers)

    history = client.get("/api/customers/imports", headers=headers).json()["data"]
    assert history["total"] == 1
    assert history["items"][0]["status"] == "completed"
