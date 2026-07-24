from __future__ import annotations

import re
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import models  # noqa: F401  (registers all models on Base.metadata)
from app.core import db as db_module
from app.core.email import factory as email_factory
from app.core.email.protocol import EmailMessage
from app.main import app


class FakeEmailProvider:
    """Captures sent emails in-memory instead of dispatching them, so tests can regex the
    plaintext verification/reset token out of the captured link (tokens are hash-only in the
    DB, so this is the only way to recover them in tests)."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    def send(self, message: EmailMessage) -> None:
        self.sent.append(message)

    def last_token_for(self, to: str) -> str:
        for message in reversed(self.sent):
            if message.to == to:
                match = re.search(r"[?&]token=([A-Za-z0-9_\-]+)", message.html_body)
                if match:
                    return match.group(1)
        raise AssertionError(f"No email with a token link found for {to}")


@pytest.fixture()
def fake_email(monkeypatch: pytest.MonkeyPatch) -> FakeEmailProvider:
    provider = FakeEmailProvider()
    monkeypatch.setattr(email_factory, "get_email_provider", lambda: provider)
    return provider


def register_and_activate(
    client: TestClient, fake_email: FakeEmailProvider, payload: dict
) -> dict:
    """Registers an owner, extracts + consumes the verification link the FakeEmailProvider
    captured, then logs in — returning {tenant, user, access_token, refresh_token}, the same
    shape the old auto-verified /register response used to return directly."""
    register_response = client.post("/api/auth/register", json=payload)
    assert register_response.status_code == 200, register_response.text
    data = register_response.json()["data"]

    token = fake_email.last_token_for(payload["email"])
    verify_response = client.post("/api/auth/verify-email", json={"token": token})
    assert verify_response.status_code == 200, verify_response.text

    login_response = client.post(
        "/api/auth/login", json={"email": payload["email"], "password": payload["password"]}
    )
    assert login_response.status_code == 200, login_response.text
    login_data = login_response.json()["data"]

    return {**data, **login_data}


def register_and_activate_standalone(client: TestClient, payload: dict) -> dict:
    """Same as register_and_activate, but self-contained (no `fake_email`/`monkeypatch` fixture
    needed) — saves and restores `email_factory.get_email_provider` manually. Used by the
    pre-existing per-file `_register(client, email)` helpers across the test suite so their
    signatures and call sites don't all need to be threaded with a new fixture param; tests run
    single-process/sequentially (no pytest-xdist), so the manual monkeypatch is safe."""
    fake_provider = FakeEmailProvider()
    original_factory = email_factory.get_email_provider
    email_factory.get_email_provider = lambda: fake_provider
    try:
        return register_and_activate(client, fake_provider, payload)
    finally:
        email_factory.get_email_provider = original_factory


@pytest.fixture()
def db_session(tmp_path) -> Generator[Session, None, None]:
    db_path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db_module.Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        session = testing_session_local()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[db_module.get_db] = override_get_db

    yield testing_session_local()

    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> TestClient:
    return TestClient(app)
