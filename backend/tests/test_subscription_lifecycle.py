from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone


def _admin_headers(client: TestClient, admin_db_session: Session, role: str = "super_admin") -> dict:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email="owner@revgeniq.com",
        password_hash=hash_password("AdminPass!123"), role=role, status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    return {"Authorization": f"Bearer {login.json()['data']['access_token']}"}


def _register_tenant(client: TestClient) -> dict:
    return register_and_activate_standalone(
        client,
        {
            "company_name": "Acme Retail",
            "legal_name": "Acme Retail Ltd",
            "email": "owner@acme.test",
            "phone": "+15551234567",
            "password": "StrongPass!123",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "country": "US",
            "currency": "USD",
            "timezone": "UTC",
        },
    )


def _last_audit_action(admin_db_session: Session) -> str:
    from app.models_admin.audit_log import AdminAuditLog

    row = admin_db_session.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).first()
    return row.action


def test_suspend_and_resume_subscription(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    suspend = client.post(f"/api/admin/customers/{tenant_id}/subscription/suspend", json={"note": "Payment failed"}, headers=headers)
    assert suspend.status_code == 200, suspend.text
    assert suspend.json()["data"]["subscription_status"] == "suspended"
    assert suspend.json()["data"]["history"][0]["event_type"] == "suspended"
    assert _last_audit_action(admin_db_session) == "tenant.subscription_suspended"

    resume = client.post(f"/api/admin/customers/{tenant_id}/subscription/resume", json={}, headers=headers)
    assert resume.status_code == 200, resume.text
    assert resume.json()["data"]["subscription_status"] == "active"
    assert resume.json()["data"]["history"][0]["event_type"] == "resumed"
    assert _last_audit_action(admin_db_session) == "tenant.subscription_resumed"


def test_expire_subscription(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    expire = client.post(f"/api/admin/customers/{tenant_id}/subscription/expire", json={}, headers=headers)
    assert expire.status_code == 200, expire.text
    assert expire.json()["data"]["subscription_status"] == "expired"
    assert _last_audit_action(admin_db_session) == "tenant.subscription_expired"


def test_extend_trial_by_days(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.post(f"/api/admin/customers/{tenant_id}/subscription/extend-trial", json={"days": 14}, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["subscription_status"] == "trialing"
    trial_ends_at = datetime.fromisoformat(data["trial_ends_at"].replace("Z", "+00:00"))
    if trial_ends_at.tzinfo is None:
        trial_ends_at = trial_ends_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    assert now + timedelta(days=13) < trial_ends_at < now + timedelta(days=15)
    assert _last_audit_action(admin_db_session) == "tenant.trial_extended"


def test_extend_trial_twice_stacks_from_existing_trial_end(client: TestClient, admin_db_session: Session) -> None:
    """Regression test: the second call reads back a `trial_ends_at` that SQLite has round-tripped
    to a naive datetime, which must not blow up comparing it against an aware `now()`."""
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    first = client.post(f"/api/admin/customers/{tenant_id}/subscription/extend-trial", json={"days": 14}, headers=headers)
    assert first.status_code == 200, first.text

    second = client.post(f"/api/admin/customers/{tenant_id}/subscription/extend-trial", json={"days": 14}, headers=headers)
    assert second.status_code == 200, second.text
    data = second.json()["data"]
    assert data["subscription_status"] == "trialing"
    trial_ends_at = datetime.fromisoformat(data["trial_ends_at"].replace("Z", "+00:00"))
    if trial_ends_at.tzinfo is None:
        trial_ends_at = trial_ends_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    # Second call should stack on top of the first (~28 days out), not reset to ~14.
    assert now + timedelta(days=27) < trial_ends_at < now + timedelta(days=29)


def test_extend_trial_requires_days_or_explicit_date(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.post(f"/api/admin/customers/{tenant_id}/subscription/extend-trial", json={}, headers=headers)
    assert response.status_code == 400


def test_lifecycle_actions_require_billing_role(client: TestClient, admin_db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session, role="support")
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    assert client.post(f"/api/admin/customers/{tenant_id}/subscription/suspend", json={}, headers=headers).status_code == 403
    assert client.post(f"/api/admin/customers/{tenant_id}/subscription/resume", json={}, headers=headers).status_code == 403
    assert client.post(f"/api/admin/customers/{tenant_id}/subscription/expire", json={}, headers=headers).status_code == 403
    assert client.post(f"/api/admin/customers/{tenant_id}/subscription/extend-trial", json={"days": 7}, headers=headers).status_code == 403
