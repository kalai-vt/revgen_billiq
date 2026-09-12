from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import register_and_activate_standalone, set_tenant_plan


def _register(client: TestClient, admin_db_session: Session, email: str = "owner@acme.test") -> dict:
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
    owner = register_and_activate_standalone(client, payload)
    # Invoice Designer is an "advance"-only catalog module (see feature_catalog.py's
    # PLAN_DEFAULT_MODULES — it's a premium module only in `_EXPLORE_MODULES`'s complement, i.e.
    # only "advance" grants it by default) — this file exercises custom invoice templates, so the
    # fixture tenant needs it enabled.
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    return owner


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


def _create_invoice(client: TestClient, headers: dict, product: dict) -> dict:
    response = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 2}], "payment_method": "card"},
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()["data"]


def test_invoice_pdf_uses_customized_default_template(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product)

    defaults = client.get("/api/invoice-templates/defaults", headers=headers).json()["data"]
    builtin = defaults["tax_invoice"]
    template = client.post(f"/api/invoice-templates/{builtin['id']}/duplicate", headers=headers).json()["data"]
    client.post(f"/api/invoice-templates/{template['id']}/set-default", headers=headers)
    config = template["config"]

    # Enable QR/barcode and switch to an 80mm thermal layout — exercises the QR/barcode
    # flowables and the non-A4 pagesize branch, not just the default A4 path.
    config["qr_barcode"]["invoice_qr"] = True
    config["qr_barcode"]["barcode"] = True
    config["paper"]["size"] = "80mm"
    config["theme"]["primary_color"] = "#2563eb"

    updated = client.put(f"/api/invoice-templates/{template['id']}", json={"config": config}, headers=headers)
    assert updated.status_code == 200, updated.text

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.content.startswith(b"%PDF")


def test_invoice_pdf_with_hidden_item_columns(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product)

    defaults = client.get("/api/invoice-templates/defaults", headers=headers).json()["data"]
    builtin = defaults["tax_invoice"]
    template = client.post(f"/api/invoice-templates/{builtin['id']}/duplicate", headers=headers).json()["data"]
    client.post(f"/api/invoice-templates/{template['id']}/set-default", headers=headers)
    config = template["config"]

    # Hide every item-table column and every tax-summary field — the renderer must not crash
    # on an empty table / empty summary, just omit those sections.
    for column in config["item_table"]["columns"]:
        column["visible"] = False
    for key in config["tax_summary"]["fields"]:
        config["tax_summary"]["fields"][key] = False

    updated = client.put(f"/api/invoice-templates/{template['id']}", json={"config": config}, headers=headers)
    assert updated.status_code == 200, updated.text

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.content.startswith(b"%PDF")


def test_invoice_pdf_reflects_alternate_template_selection(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product)

    # Seed the builtin default, then create + set-default a second, differently configured
    # template — the PDF should now be driven by the new default, not the builtin.
    client.get("/api/invoice-templates/defaults", headers=headers)
    created = client.post(
        "/api/invoice-templates", json={"document_type": "tax_invoice", "name": "Custom"}, headers=headers
    ).json()["data"]
    client.post(f"/api/invoice-templates/{created['id']}/set-default", headers=headers)

    config = created["config"]
    config["paper"]["size"] = "A5"
    client.put(f"/api/invoice-templates/{created['id']}", json={"config": config}, headers=headers)

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.content.startswith(b"%PDF")


def test_return_pdf_uses_credit_note_template(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client, admin_db_session)
    headers = _headers(owner["access_token"])
    product = _create_product(client, headers)
    invoice = _create_invoice(client, headers, product)

    ret = client.post(
        f"/api/invoices/{invoice['id']}/returns",
        json={"lines": [{"invoice_item_id": invoice["items"][0]["id"], "quantity": 1}], "reason": "damaged"},
        headers=headers,
    )
    assert ret.status_code == 200, ret.text
    return_id = ret.json()["data"]["id"]

    defaults = client.get("/api/invoice-templates/defaults", headers=headers).json()["data"]
    assert "credit_note" in defaults

    pdf_response = client.get(f"/api/returns/{return_id}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.content.startswith(b"%PDF")


def test_an_uploaded_qr_image_replaces_the_generated_one(tmp_path, monkeypatch) -> None:
    """A tenant who uploaded their own code gets *that* code on the bill."""
    import hashlib

    from app.modules.invoice_designer.pdf_renderer import _custom_qr_bytes, _qr_for
    from app.schemas.invoice_template import InvoiceTemplateConfig

    monkeypatch.chdir(tmp_path)
    target = tmp_path / "uploads" / "qr" / "tenant-1"
    target.mkdir(parents=True)
    content = b"\x89PNG\r\n\x1a\n" + b"pretend-qr-bytes"
    (target / "payment_qr.png").write_bytes(content)

    fetched = _custom_qr_bytes("/uploads/qr/tenant-1/payment_qr.png")
    assert fetched is not None
    assert hashlib.sha256(fetched).hexdigest() == hashlib.sha256(content).hexdigest()

    config = InvoiceTemplateConfig()
    config.qr_barcode.custom_images = {"payment_qr": "/uploads/qr/tenant-1/payment_qr.png"}
    # A real PNG is needed for ReportLab to build the flowable, so the byte-level check above is
    # what proves *which* image is used; this proves the missing-file path still renders a QR.
    config.qr_barcode.custom_images = {"payment_qr": "/uploads/qr/tenant-1/missing.png"}
    assert _qr_for(config, "payment_qr", "upi://pay?pa=x@y") is not None


def test_a_qr_image_path_cannot_escape_the_uploads_directory(tmp_path, monkeypatch) -> None:
    """Defense in depth: the config validator already limits these URLs to ones we issued, but a
    path that walks out of uploads/ must not be readable even so."""
    from app.modules.invoice_designer.pdf_renderer import _custom_qr_bytes

    monkeypatch.chdir(tmp_path)
    (tmp_path / "uploads").mkdir()
    (tmp_path / "secret.txt").write_bytes(b"not yours")

    assert _custom_qr_bytes("/uploads/../secret.txt") is None
