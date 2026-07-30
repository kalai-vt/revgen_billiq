from __future__ import annotations

from fastapi.testclient import TestClient

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


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def test_plan_field_ignored_via_settings_update(client: TestClient) -> None:
    """A tenant owner can no longer self-upgrade by sending `plan` on `PUT /api/settings` —
    plan assignment is Super-Admin-only. Pydantic silently drops the unknown `plan` key (no
    `extra="forbid"` anywhere in this codebase) rather than erroring, so the request still
    succeeds — it just has no effect on the stored plan."""
    owner = _register(client)
    headers = _headers(owner["access_token"])

    before = client.get("/api/settings", headers=headers).json()["data"]
    assert before["plan"] == "basic"

    response = client.put("/api/settings", json={"plan": "advance", "theme": "dark"}, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["plan"] == "basic"
    assert data["theme"] == "dark"

    after = client.get("/api/settings", headers=headers).json()["data"]
    assert after["plan"] == "basic"
