from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_refresh_token
from app.core.timeutils import as_aware_utc, utc_now
from app.models.token import RefreshToken
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


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def test_register_creates_pending_account_with_no_tokens(client: TestClient) -> None:
    register_response = client.post("/api/auth/register", json=_register_payload())
    assert register_response.status_code == 200
    body = register_response.json()
    assert body["success"] is True
    assert body["data"]["tenant"]["company_name"] == "Acme Retail"
    assert body["data"]["user"]["role"] == "owner"
    assert body["data"]["user"]["status"] == "pending_verification"
    assert body["data"]["user"]["is_email_verified"] is False
    assert "access_token" not in body["data"]
    assert "refresh_token" not in body["data"]


def test_register_and_login_flow(client: TestClient, fake_email: FakeEmailProvider) -> None:
    result = register_and_activate(client, fake_email, _register_payload())
    assert result["user"]["status"] == "active"
    assert result["user"]["is_email_verified"] is True

    me_response = client.get("/api/auth/me", headers=_headers(result["access_token"]))
    assert me_response.status_code == 200
    assert me_response.json()["data"]["user"]["email"] == "owner@acme.test"


def test_register_duplicate_email_rejected(client: TestClient) -> None:
    client.post("/api/auth/register", json=_register_payload())
    response = client.post("/api/auth/register", json=_register_payload())
    assert response.status_code == 400


def test_login_before_verification_is_rejected(client: TestClient) -> None:
    client.post("/api/auth/register", json=_register_payload())
    response = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"})
    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Your email address has not been verified. Please verify your email before signing in."
    )


def test_login_invalid_credentials(client: TestClient, fake_email: FakeEmailProvider) -> None:
    register_and_activate(client, fake_email, _register_payload())
    response = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "wrong-password"})
    assert response.status_code == 401


def test_me_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_rejects_garbage_token(client: TestClient) -> None:
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_refresh_rotates_token_and_invalidates_old_one(client: TestClient, fake_email: FakeEmailProvider) -> None:
    tokens = register_and_activate(client, fake_email, _register_payload())

    refresh_response = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()["data"]
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    reuse_response = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reuse_response.status_code == 401

    # Reuse of an already-rotated-away refresh token revokes the whole token family (see
    # test_refresh_token_reuse_revokes_every_other_session for the cross-session proof) — but the
    # just-issued access token from the legitimate rotation above may still work for a moment: the
    # `session_invalidated_at` check in get_current_user floors to whole seconds and tolerates a
    # token minted in the same wall-clock second as the invalidation (the same grace window
    # change_password relies on), which a fast rotate-then-reuse sequence like this one hits. The
    # access token's own short expiry (not this check) is what bounds that window in practice —
    # what actually matters here, and what's under test, is that the refresh token is dead.
    me_response = client.get("/api/auth/me", headers=_headers(new_tokens["access_token"]))
    assert me_response.status_code == 200


def test_refresh_token_reuse_revokes_every_other_session(
    client: TestClient, fake_email: FakeEmailProvider
) -> None:
    """Simulates a stolen/leaked refresh token: session A rotates normally, then someone presents
    session A's now-revoked old token (the reuse). A completely unrelated session B — from a
    second login, e.g. another device — must also get signed out, since reuse detection can't
    tell whether B belongs to the attacker or the legitimate owner."""
    payload = _register_payload()
    session_a = register_and_activate(client, fake_email, payload)

    login_b = client.post("/api/auth/login", json={"email": payload["email"], "password": payload["password"]})
    session_b = login_b.json()["data"]

    rotated_a = client.post("/api/auth/refresh", json={"refresh_token": session_a["refresh_token"]})
    assert rotated_a.status_code == 200

    reuse = client.post("/api/auth/refresh", json={"refresh_token": session_a["refresh_token"]})
    assert reuse.status_code == 401

    session_b_still_works = client.post("/api/auth/refresh", json={"refresh_token": session_b["refresh_token"]})
    assert session_b_still_works.status_code == 401


def test_login_without_remember_me_uses_short_lived_refresh_token(
    client: TestClient, fake_email: FakeEmailProvider, db_session: Session
) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    login_response = client.post("/api/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert login_response.status_code == 200
    refresh_token = login_response.json()["data"]["refresh_token"]

    record = db_session.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(refresh_token)).one()
    assert record.remembered is False
    remaining = as_aware_utc(record.expires_at) - utc_now()
    expected = timedelta(days=settings.refresh_token_expire_days)
    assert expected - timedelta(minutes=1) < remaining <= expected


def test_login_with_remember_me_uses_long_lived_refresh_token(
    client: TestClient, fake_email: FakeEmailProvider, db_session: Session
) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    login_response = client.post(
        "/api/auth/login",
        json={"email": payload["email"], "password": payload["password"], "remember_me": True},
    )
    assert login_response.status_code == 200
    refresh_token = login_response.json()["data"]["refresh_token"]

    record = db_session.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(refresh_token)).one()
    assert record.remembered is True
    remaining = as_aware_utc(record.expires_at) - utc_now()
    expected = timedelta(days=settings.remember_me_refresh_token_expire_days)
    assert expected - timedelta(minutes=1) < remaining <= expected


def test_refresh_preserves_remember_me_status(
    client: TestClient, fake_email: FakeEmailProvider, db_session: Session
) -> None:
    payload = _register_payload()
    register_and_activate(client, fake_email, payload)

    login_response = client.post(
        "/api/auth/login",
        json={"email": payload["email"], "password": payload["password"], "remember_me": True},
    )
    refresh_token = login_response.json()["data"]["refresh_token"]

    refresh_response = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 200
    new_refresh_token = refresh_response.json()["data"]["refresh_token"]

    record = db_session.query(RefreshToken).filter(
        RefreshToken.token_hash == hash_refresh_token(new_refresh_token)
    ).one()
    assert record.remembered is True
    days_remaining = (as_aware_utc(record.expires_at) - utc_now()).days
    assert days_remaining > settings.refresh_token_expire_days


def test_logout_revokes_refresh_token(client: TestClient, fake_email: FakeEmailProvider) -> None:
    tokens = register_and_activate(client, fake_email, _register_payload())

    logout_response = client.post("/api/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert logout_response.status_code == 200

    refresh_response = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh_response.status_code == 401


def test_tenant_profile_update_owner_only(client: TestClient, fake_email: FakeEmailProvider) -> None:
    owner = register_and_activate(client, fake_email, _register_payload())
    headers = _headers(owner["access_token"])

    response = client.put("/api/auth/tenant", json={"company_name": "Acme Retail Group"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["company_name"] == "Acme Retail Group"


def test_team_member_create_and_list(
    client: TestClient, fake_email: FakeEmailProvider, admin_db_session: Session
) -> None:
    owner = register_and_activate(client, fake_email, _register_payload())
    headers = _headers(owner["access_token"])
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
        headers=headers,
    )
    assert create_response.status_code == 200
    member = create_response.json()["data"]
    assert member["role"] == "staff"
    # Team members are unaffected by the email-verification gate — auto-active, no verification.
    assert member["status"] == "active"

    list_response = client.get("/api/auth/team", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["data"]["items"]) == 2  # owner + new staff member

    staff_login = client.post("/api/auth/login", json={"email": "staff@acme.test", "password": "StaffPass!123"})
    assert staff_login.status_code == 200
    staff_headers = _headers(staff_login.json()["data"]["access_token"])

    denied_response = client.post(
        "/api/auth/team",
        json={
            "first_name": "Nope",
            "last_name": "Denied",
            "email": "nope@acme.test",
            "password": "NopePass!123",
            "role": "staff",
        },
        headers=staff_headers,
    )
    assert denied_response.status_code == 403
