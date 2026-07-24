from __future__ import annotations

import time
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.timeutils import utc_now
from app.models.token import RefreshToken
from app.models.verification import PasswordResetToken
from tests.conftest import FakeEmailProvider, register_and_activate


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


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


_GENERIC_MESSAGE = "If an account exists for this email, a password reset link has been sent."


def test_forgot_password_returns_identical_message_for_known_and_unknown_email(
    client: TestClient, fake_email: FakeEmailProvider
) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    known_response = client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    unknown_response = client.post("/api/auth/forgot-password", json={"email": "nobody@acme.test"})

    assert known_response.status_code == 200
    assert unknown_response.status_code == 200
    assert known_response.json()["message"] == _GENERIC_MESSAGE
    assert unknown_response.json()["message"] == _GENERIC_MESSAGE


def test_forgot_password_sends_email_only_for_known_account(client: TestClient, fake_email: FakeEmailProvider) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)
    fake_email.sent.clear()

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    assert len(fake_email.sent) == 1

    client.post("/api/auth/forgot-password", json={"email": "nobody@acme.test"})
    assert len(fake_email.sent) == 1


def test_forgot_password_rate_limited_silently_after_five_per_hour(
    client: TestClient, fake_email: FakeEmailProvider
) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)
    fake_email.sent.clear()

    for _ in range(5):
        response = client.post("/api/auth/forgot-password", json={"email": payload["email"]})
        assert response.status_code == 200
        assert response.json()["message"] == _GENERIC_MESSAGE
    assert len(fake_email.sent) == 5

    sixth = client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    assert sixth.status_code == 200
    assert sixth.json()["message"] == _GENERIC_MESSAGE
    assert len(fake_email.sent) == 5  # silently dropped, no 6th email sent


def test_reset_password_happy_path_forces_relogin_everywhere(
    client: TestClient, fake_email: FakeEmailProvider
) -> None:
    payload = _register_payload()
    tokens = register_and_activate(client, fake_email, payload)
    old_access_token = tokens["access_token"]
    old_refresh_token = tokens["refresh_token"]

    # Session invalidation compares JWT `iat` (whole-second granularity) against
    # session_invalidated_at — sleep past the second boundary so the old token's issue time is
    # unambiguously earlier, matching realistic timing between login and a later reset.
    time.sleep(1.1)

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    reset_token = fake_email.last_token_for(payload["email"])

    reset_response = client.post(
        "/api/auth/reset-password", json={"token": reset_token, "new_password": "NewStrongPass!456"}
    )
    assert reset_response.status_code == 200

    # Old access token is now rejected.
    stale_me = client.get("/api/auth/me", headers=_headers(old_access_token))
    assert stale_me.status_code == 401

    # Old refresh token is now rejected.
    stale_refresh = client.post("/api/auth/refresh", json={"refresh_token": old_refresh_token})
    assert stale_refresh.status_code == 401

    # Login with the new password succeeds; old password no longer works.
    new_login = client.post("/api/auth/login", json={"email": payload["email"], "password": "NewStrongPass!456"})
    assert new_login.status_code == 200

    old_login = client.post("/api/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert old_login.status_code == 401


def test_reset_password_rejects_expired_token(
    client: TestClient, db_session: Session, fake_email: FakeEmailProvider
) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    reset_token = fake_email.last_token_for(payload["email"])

    record = db_session.query(PasswordResetToken).first()
    record.expires_at = utc_now() - timedelta(minutes=1)
    db_session.add(record)
    db_session.commit()

    response = client.post(
        "/api/auth/reset-password", json={"token": reset_token, "new_password": "NewStrongPass!456"}
    )
    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


def test_reset_password_rejects_reused_token(client: TestClient, fake_email: FakeEmailProvider) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    reset_token = fake_email.last_token_for(payload["email"])

    first = client.post(
        "/api/auth/reset-password", json={"token": reset_token, "new_password": "NewStrongPass!456"}
    )
    assert first.status_code == 200

    second = client.post(
        "/api/auth/reset-password", json={"token": reset_token, "new_password": "AnotherStrongPass!789"}
    )
    assert second.status_code == 400


def test_reset_password_rejects_same_as_current_password(client: TestClient, fake_email: FakeEmailProvider) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    reset_token = fake_email.last_token_for(payload["email"])

    response = client.post(
        "/api/auth/reset-password", json={"token": reset_token, "new_password": payload["password"]}
    )
    assert response.status_code == 400
    assert "different" in response.json()["detail"].lower()


def test_reset_password_rejects_weak_new_password(client: TestClient, fake_email: FakeEmailProvider) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    reset_token = fake_email.last_token_for(payload["email"])

    response = client.post("/api/auth/reset-password", json={"token": reset_token, "new_password": "weak"})
    assert response.status_code == 422


def test_new_password_reset_request_invalidates_previous_token(
    client: TestClient, fake_email: FakeEmailProvider
) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    first_token = fake_email.last_token_for(payload["email"])

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    second_token = fake_email.last_token_for(payload["email"])
    assert second_token != first_token

    stale = client.post(
        "/api/auth/reset-password", json={"token": first_token, "new_password": "NewStrongPass!456"}
    )
    assert stale.status_code == 400

    fresh = client.post(
        "/api/auth/reset-password", json={"token": second_token, "new_password": "NewStrongPass!456"}
    )
    assert fresh.status_code == 200


def test_reset_password_revokes_all_refresh_tokens(
    client: TestClient, db_session: Session, fake_email: FakeEmailProvider
) -> None:
    payload = _register_payload()
    tokens = register_and_activate(client, fake_email, payload)

    # A second login creates a second, independent refresh token (e.g. a different device/session).
    second_login = client.post("/api/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert second_login.status_code == 200

    client.post("/api/auth/forgot-password", json={"email": payload["email"]})
    reset_token = fake_email.last_token_for(payload["email"])
    client.post("/api/auth/reset-password", json={"token": reset_token, "new_password": "NewStrongPass!456"})

    user_id = tokens["user"]["id"]
    active_tokens = (
        db_session.query(RefreshToken).filter(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False)).count()
    )
    assert active_tokens == 0
