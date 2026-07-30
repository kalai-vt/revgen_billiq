from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import limiter


@pytest.fixture()
def rate_limiting_enabled():
    """conftest.py disables the limiter globally so the rest of the suite isn't affected by a
    process-global in-memory store — this fixture re-enables it just for tests that need to
    verify the limiting behavior itself, and resets storage before and after so it can't leak
    into other tests."""
    limiter.enabled = True
    limiter._storage.reset()
    yield
    limiter._storage.reset()
    limiter.enabled = False


def test_admin_login_rate_limited_after_20_per_minute(client: TestClient, rate_limiting_enabled) -> None:
    for _ in range(20):
        response = client.post("/api/admin/auth/login", json={"email": "nobody@example.test", "password": "wrong"})
        assert response.status_code != 429

    blocked = client.post("/api/admin/auth/login", json={"email": "nobody@example.test", "password": "wrong"})
    assert blocked.status_code == 429


def test_register_rate_limited_after_10_per_hour(client: TestClient, rate_limiting_enabled) -> None:
    payload = {
        "company_name": "Rate Limit Co",
        "legal_name": "Rate Limit Co Ltd",
        "email": "owner@ratelimit.test",
        "phone": "+15559998888",
        "password": "StrongPass!123",
        "first_name": "Rae",
        "last_name": "Limit",
        "country": "US",
        "currency": "USD",
        "timezone": "UTC",
    }
    for _ in range(10):
        client.post("/api/auth/register", json=payload)

    blocked = client.post("/api/auth/register", json=payload)
    assert blocked.status_code == 429
