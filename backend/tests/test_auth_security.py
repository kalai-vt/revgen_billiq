from __future__ import annotations

from fastapi.testclient import TestClient
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.models.user import User
from tests.conftest import FakeEmailProvider, register_and_activate

_legacy_pbkdf2_context = CryptContext(schemes=["pbkdf2_sha256"])


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


def test_account_locks_after_max_failed_attempts(client: TestClient, fake_email: FakeEmailProvider) -> None:
    register_and_activate(client, fake_email, _register_payload())

    for _ in range(5):
        response = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "wrong-password"})
        assert response.status_code == 401

    # Even the correct password is now rejected while locked.
    locked_response = client.post(
        "/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"}
    )
    assert locked_response.status_code == 401
    assert "locked" in locked_response.json()["detail"].lower()


def test_successful_login_resets_failed_attempt_counter(
    client: TestClient, db_session: Session, fake_email: FakeEmailProvider
) -> None:
    register_and_activate(client, fake_email, _register_payload())

    for _ in range(3):
        client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "wrong-password"})

    ok_response = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"})
    assert ok_response.status_code == 200

    user = db_session.query(User).filter(User.email == "owner@acme.test").first()
    assert user.failed_attempts == 0
    assert user.locked_until is None
    assert user.last_login is not None


def test_login_with_nonexistent_email_does_not_reveal_account_state(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "nobody@acme.test", "password": "whatever123"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_legacy_pbkdf2_hash_is_transparently_upgraded_to_argon2_on_login(
    client: TestClient, db_session: Session, fake_email: FakeEmailProvider
) -> None:
    registered = register_and_activate(client, fake_email, _register_payload())
    user = db_session.query(User).filter(User.email == "owner@acme.test").first()

    # Simulate an account created before the argon2 migration.
    legacy_hash = _legacy_pbkdf2_context.hash("StrongPass!123")
    user.password_hash = legacy_hash
    db_session.add(user)
    db_session.commit()
    assert user.password_hash.startswith("$pbkdf2-sha256$")

    login_response = client.post("/api/auth/login", json={"email": "owner@acme.test", "password": "StrongPass!123"})
    assert login_response.status_code == 200
    assert login_response.json()["data"]["user"]["id"] == registered["user"]["id"]

    db_session.refresh(user)
    assert user.password_hash.startswith("$argon2")
