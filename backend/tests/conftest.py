from __future__ import annotations

import re
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import models  # noqa: F401  (registers all models on Base.metadata)
from app import models_admin  # noqa: F401  (registers all models on AdminBase.metadata)
from app.core import admin_db as admin_db_module
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


def set_tenant_plan(client: TestClient, admin_db_session: Session, tenant_id: str, plan: str) -> None:
    """Plan assignment is Super-Admin-only — `PUT /api/settings` no longer accepts a `plan`
    field (tenants can't self-upgrade). Tests that need a tenant on a specific plan go through
    the same admin endpoint a real Super Admin uses, via a throwaway admin account scoped to
    this call."""
    import uuid

    from app.core.security import hash_password
    from app.models_admin.admin_user import AdminUser

    admin = AdminUser(
        first_name="Test",
        last_name="Admin",
        email=f"test-admin-{uuid.uuid4().hex[:12]}@revgeniq.com",
        password_hash=hash_password("AdminPass!123"),
        role="super_admin",
        status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    login = client.post("/api/admin/auth/login", json={"email": admin.email, "password": "AdminPass!123"})
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}
    response = client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": plan}, headers=headers)
    assert response.status_code == 200, response.text


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

    # A second, genuinely separate SQLite file mirrors the production setup (a separate Postgres
    # database for the Admin Portal) closely enough to catch cross-database mistakes — e.g. an
    # admin query accidentally assuming it can join against a billing-DB table.
    admin_db_path = tmp_path / "test_admin.db"
    admin_engine = create_engine(f"sqlite:///{admin_db_path}", connect_args={"check_same_thread": False})
    admin_testing_session_local = sessionmaker(bind=admin_engine, autoflush=False, autocommit=False)
    admin_db_module.AdminBase.metadata.create_all(bind=admin_engine)

    def override_get_db() -> Generator[Session, None, None]:
        session = testing_session_local()
        try:
            yield session
        finally:
            session.close()

    def override_get_admin_db() -> Generator[Session, None, None]:
        session = admin_testing_session_local()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[db_module.get_db] = override_get_db
    app.dependency_overrides[admin_db_module.get_admin_db] = override_get_admin_db

    yield testing_session_local()

    app.dependency_overrides.clear()
    engine.dispose()
    admin_engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> TestClient:
    return TestClient(app)


@pytest.fixture()
def admin_db_session(db_session: Session) -> Generator[Session, None, None]:
    """Direct access to the admin database session for seeding AdminUser rows in tests — there's
    no public admin self-registration endpoint, so tests create admin accounts directly."""
    override = app.dependency_overrides[admin_db_module.get_admin_db]
    session = next(override())
    yield session
    session.close()
