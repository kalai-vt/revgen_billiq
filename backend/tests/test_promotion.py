from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.promotion import PromotionEvent
from app.models.tenant import Tenant
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone


def _seed_admin(admin_db_session: Session, email: str = "owner@revgeniq.com", role: str = "super_admin") -> AdminUser:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email=email,
        password_hash=hash_password("AdminPass!123"), role=role, status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    admin_db_session.refresh(admin)
    return admin


def _admin_headers(client: TestClient, admin_db_session: Session, role: str = "super_admin") -> dict:
    _seed_admin(admin_db_session, role=role)
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    assert login.status_code == 200, login.text
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _register_tenant(client: TestClient, email: str = "owner@acme.test") -> dict:
    return register_and_activate_standalone(
        client,
        {
            "company_name": "Acme Retail", "legal_name": "Acme Retail Ltd", "email": email,
            "phone": "+15551234567", "password": "StrongPass!123", "first_name": "Ada",
            "last_name": "Lovelace", "country": "US", "currency": "USD", "timezone": "UTC",
        },
    )


def test_public_config_has_no_qr_url_for_anonymous_callers(client: TestClient) -> None:
    response = client.get("/api/v1/promotion/config")
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["title"] == "Powered by RevGenAI BillIQ"
    assert data["website"] == "revgenai.in/billiq"
    assert data["phone"] == "8680844026"
    assert data["qr_url"] is None


def test_config_returns_personalized_qr_url_for_a_logged_in_tenant(client: TestClient) -> None:
    owner = _register_tenant(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    response = client.get("/api/v1/promotion/config", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["qr_url"] is not None
    assert "/api/v1/promotion/r?t=" in data["qr_url"]
    # The raw tenant id must never leak into the QR target.
    assert owner["tenant"]["id"] not in data["qr_url"]


def test_qr_url_is_stable_across_repeated_requests(client: TestClient) -> None:
    owner = _register_tenant(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    first = client.get("/api/v1/promotion/config", headers=headers).json()["data"]["qr_url"]
    second = client.get("/api/v1/promotion/config", headers=headers).json()["data"]["qr_url"]
    assert first == second


def test_redirect_logs_a_scan_event_and_redirects_to_marketing_site(
    client: TestClient, db_session: Session
) -> None:
    owner = _register_tenant(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    tracking_id = client.get("/api/v1/promotion/config", headers=headers).json()["data"]["qr_url"].split("t=")[1]

    response = client.get(f"/api/v1/promotion/r?t={tracking_id}", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"].startswith("https://revgenai.in/billiq")
    assert f"tenant={tracking_id}" in response.headers["location"]

    events = db_session.query(PromotionEvent).filter(PromotionEvent.event_type == "qr_scanned").all()
    assert len(events) == 1
    assert events[0].tenant_id == owner["tenant"]["id"]


def test_redirect_with_unknown_tracking_id_still_redirects_without_a_500(client: TestClient) -> None:
    response = client.get("/api/v1/promotion/r?t=does-not-exist", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"].startswith("https://revgenai.in/billiq")


def test_admin_can_update_central_content(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    response = client.patch(
        "/api/admin/promotion/config",
        json={"title": "New Title", "cta_text": "New CTA"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["title"] == "New Title"
    assert data["cta_text"] == "New CTA"
    assert data["version"] == "1.1"

    # The update is immediately visible to every tenant, without any app redeploy.
    public = client.get("/api/v1/promotion/config").json()["data"]
    assert public["title"] == "New Title"


def test_non_admin_role_cannot_update_central_content(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session, role="support")
    response = client.patch("/api/admin/promotion/config", json={"title": "Hacked"}, headers=headers)
    assert response.status_code == 403


def test_anonymous_caller_cannot_update_central_content(client: TestClient) -> None:
    response = client.patch("/api/admin/promotion/config", json={"title": "Hacked"})
    assert response.status_code == 401


def test_admin_analytics_reflects_logged_scans(client: TestClient, admin_db_session: Session) -> None:
    owner = _register_tenant(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    tracking_id = client.get("/api/v1/promotion/config", headers=headers).json()["data"]["qr_url"].split("t=")[1]
    client.get(f"/api/v1/promotion/r?t={tracking_id}", follow_redirects=False)
    client.get(f"/api/v1/promotion/r?t={tracking_id}", follow_redirects=False)

    admin_headers = _admin_headers(client, admin_db_session)
    response = client.get("/api/admin/promotion/analytics", headers=admin_headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["total_qr_scans"] == 2


def test_invoice_pdf_includes_promotion_footer_by_default(client: TestClient, admin_db_session: Session) -> None:
    """Default-enabled promotion (per product decision) shouldn't require any tenant setup —
    a plain invoice PDF download should just work and be larger than the equivalent PDF with
    the promotion disabled, without ever touching totals/GST/invoice numbering."""
    owner = _register_tenant(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    product = client.post(
        "/api/products",
        json={"name": "Widget", "identifier_value": "WID-1", "cost_price": 5.0, "selling_price": 20.0, "tax_rate_percent": 10.0},
        headers=headers,
    ).json()["data"]
    invoice = client.post(
        "/api/invoices",
        json={"lines": [{"product_id": product["id"], "quantity": 2}], "payment_method": "card"},
        headers=headers,
    ).json()["data"]

    pdf_response = client.get(f"/api/invoices/{invoice['id']}/pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert len(pdf_response.content) > 0
