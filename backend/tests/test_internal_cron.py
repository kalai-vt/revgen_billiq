from __future__ import annotations

import os
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.timeutils import utc_now
from app.models.notification import Notification
from app.models.settings import Settings
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


def test_cron_endpoint_requires_secret(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    response = client.get("/api/internal/cron/subscription-check")
    assert response.status_code == 401

    wrong = client.get("/api/internal/cron/subscription-check", headers={"Authorization": "Bearer wrong"})
    assert wrong.status_code == 401


def test_cron_endpoint_rejects_when_unconfigured(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("CRON_SECRET", raising=False)
    response = client.get("/api/internal/cron/subscription-check", headers={"Authorization": "Bearer anything"})
    assert response.status_code == 401


def test_cron_expires_overdue_trial_and_notifies(client: TestClient, db_session: Session, monkeypatch) -> None:
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    owner = _register(client)
    tenant_id = owner["tenant"]["id"]

    settings_row = db_session.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    settings_row.subscription_status = "trialing"
    settings_row.trial_ends_at = utc_now() - timedelta(days=1)
    db_session.add(settings_row)
    db_session.commit()

    response = client.get(
        "/api/internal/cron/subscription-check", headers={"Authorization": "Bearer test-secret"}
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["trials_expired"] == 1

    db_session.refresh(settings_row)
    assert settings_row.subscription_status == "expired"

    notifications = db_session.query(Notification).filter(Notification.tenant_id == tenant_id).all()
    assert any(n.type == "subscription_expiry" for n in notifications)


def test_cron_warns_trial_ending_soon_once_per_day(client: TestClient, db_session: Session, monkeypatch) -> None:
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    owner = _register(client)
    tenant_id = owner["tenant"]["id"]

    settings_row = db_session.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    settings_row.subscription_status = "trialing"
    settings_row.trial_ends_at = utc_now() + timedelta(days=1)
    db_session.add(settings_row)
    db_session.commit()

    headers = {"Authorization": "Bearer test-secret"}
    first = client.get("/api/internal/cron/subscription-check", headers=headers)
    assert first.json()["data"]["trial_ending_warnings"] == 1

    # Running it again the same day must not create a second warning notification.
    second = client.get("/api/internal/cron/subscription-check", headers=headers)
    assert second.json()["data"]["trial_ending_warnings"] == 0

    notifications = db_session.query(Notification).filter(
        Notification.tenant_id == tenant_id, Notification.type == "trial_ending_soon"
    ).all()
    assert len(notifications) == 1


def test_cron_warns_on_approaching_limit(client: TestClient, db_session: Session, monkeypatch) -> None:
    monkeypatch.setenv("CRON_SECRET", "test-secret")
    owner = _register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    tenant_id = owner["tenant"]["id"]

    from app.models.tenant_limit import TenantLimitOverride

    db_session.add(TenantLimitOverride(tenant_id=tenant_id, limit_key="max_customers", limit_value=2, updated_by="test"))
    db_session.commit()

    client.post("/api/customers", json={"name": "A"}, headers=headers)
    client.post("/api/customers", json={"name": "B"}, headers=headers)

    cron_response = client.get(
        "/api/internal/cron/subscription-check", headers={"Authorization": "Bearer test-secret"}
    )
    assert cron_response.json()["data"]["limit_warnings"] >= 1

    notifications = db_session.query(Notification).filter(
        Notification.tenant_id == tenant_id, Notification.type == "limit_approaching:customers"
    ).all()
    assert len(notifications) == 1
