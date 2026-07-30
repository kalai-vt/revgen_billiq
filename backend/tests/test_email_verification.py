from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from datetime import timedelta

from app.core.timeutils import utc_now
from app.models.verification import EmailVerificationToken
from tests.conftest import FakeEmailProvider, register_and_activate, set_tenant_plan


def _register_payload(email: str = "owner@acme.test") -> dict:
    return {
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


def test_unverified_user_cannot_login(client: TestClient) -> None:
    client.post("/api/auth/register", json=_register_payload())
    response = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"})
    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Your email address has not been verified. Please verify your email before signing in."
    )


def test_verify_email_activates_account_and_allows_login(client: TestClient, fake_email: FakeEmailProvider) -> None:
    result = register_and_activate(client, fake_email, _register_payload())
    assert result["user"]["status"] == "active"
    assert result["user"]["is_email_verified"] is True


def test_verify_email_rejects_expired_token(client: TestClient, db_session: Session, fake_email: FakeEmailProvider) -> None:
    payload = _register_payload()
    client.post("/api/auth/register", json=payload)
    token = fake_email.last_token_for(payload["email"])

    record = db_session.query(EmailVerificationToken).first()
    record.expires_at = utc_now() - timedelta(minutes=1)
    db_session.add(record)
    db_session.commit()

    response = client.post("/api/auth/verify-email", json={"token": token})
    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


def test_verify_email_rejects_reused_token(client: TestClient, fake_email: FakeEmailProvider) -> None:
    payload = _register_payload()
    client.post("/api/auth/register", json=payload)
    token = fake_email.last_token_for(payload["email"])

    first = client.post("/api/auth/verify-email", json={"token": token})
    assert first.status_code == 200

    second = client.post("/api/auth/verify-email", json={"token": token})
    assert second.status_code == 400


def test_verify_email_rejects_invalid_token(client: TestClient) -> None:
    response = client.post("/api/auth/verify-email", json={"token": "not-a-real-token"})
    assert response.status_code == 400


def test_resend_verification_issues_new_token_and_invalidates_previous(
    client: TestClient, db_session: Session, fake_email: FakeEmailProvider
) -> None:
    payload = _register_payload()
    client.post("/api/auth/register", json=payload)
    first_token = fake_email.last_token_for(payload["email"])

    resend = client.post("/api/auth/resend-verification", json={"email": payload["email"]})
    assert resend.status_code == 200
    second_token = fake_email.last_token_for(payload["email"])
    assert second_token != first_token

    # The first token is now invalidated.
    stale_verify = client.post("/api/auth/verify-email", json={"token": first_token})
    assert stale_verify.status_code == 400

    fresh_verify = client.post("/api/auth/verify-email", json={"token": second_token})
    assert fresh_verify.status_code == 200


def test_resend_verification_rate_limited_after_three_per_hour(client: TestClient, fake_email: FakeEmailProvider) -> None:
    payload = _register_payload()
    client.post("/api/auth/register", json=payload)

    for _ in range(3):
        response = client.post("/api/auth/resend-verification", json={"email": payload["email"]})
        assert response.status_code == 200

    fourth = client.post("/api/auth/resend-verification", json={"email": payload["email"]})
    assert fourth.status_code == 429


def test_resend_verification_for_already_verified_account_rejected(
    client: TestClient, fake_email: FakeEmailProvider
) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    response = client.post("/api/auth/resend-verification", json={"email": payload["email"]})
    assert response.status_code == 400


def test_resend_verification_for_unknown_email_returns_404(client: TestClient) -> None:
    response = client.post("/api/auth/resend-verification", json={"email": "nobody@acme.test"})
    assert response.status_code == 404


def test_team_member_still_auto_active_without_verification(
    client: TestClient, fake_email: FakeEmailProvider, admin_db_session: Session
) -> None:
    owner = register_and_activate(client, fake_email, _register_payload())
    owner_headers = {"Authorization": f"Bearer {owner['access_token']}"}
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "explore")

    create_response = client.post(
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
    assert create_response.status_code == 200
    assert create_response.json()["data"]["status"] == "active"
    assert create_response.json()["data"]["is_email_verified"] is False

    login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    assert login.status_code == 200
