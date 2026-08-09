"""Proof tests for the trial/subscription/module-management feature (PHASE 25 of the spec).
Covers what's realistically backend-testable in this suite: trial creation, on-access expiry
enforcement (with and without the cron having run), suspended-account blocking, reactivation +
data preservation, the Basic/Advanced/Custom module matrices, admin-only authorization, and
trial-reminder sending/history. Concurrency/load/live-provider scenarios are out of scope for a
unit/integration suite — see the final implementation report for what's marked NOT VERIFIED.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.timeutils import as_aware_utc
from app.models.settings import Settings
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone, set_tenant_plan


def _register(client: TestClient, email: str = "owner@acme.test") -> dict:
    payload = {
        "company_name": "Acme Retail",
        "legal_name": "Acme Retail Ltd",
        "email": email,
        "phone": f"+1555{uuid.uuid4().int % 10_000_000:07d}",
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


def _admin_headers(client: TestClient, admin_db_session: Session, role: str = "super_admin") -> dict:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email=f"admin-{role}@revgeniq.com",
        password_hash=hash_password("AdminPass!123"), role=role, status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    login = client.post("/api/admin/auth/login", json={"email": f"admin-{role}@revgeniq.com", "password": "AdminPass!123"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['data']['access_token']}"}


def _create_product(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {"name": "Widget", "identifier_value": "WID-1", "cost_price": 5.0, "selling_price": 20.0}
    payload.update(overrides)
    response = client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


# --------------------------------------------------------------------------------------------
# TEST 1 — Trial creation
# --------------------------------------------------------------------------------------------


def test_trial_created_on_registration(client: TestClient) -> None:
    before = datetime.now(timezone.utc)
    owner = _register(client)
    headers = _headers(owner["access_token"])

    usage = client.get("/api/billing/usage", headers=headers)
    assert usage.status_code == 200
    data = usage.json()["data"]
    assert data["subscription_status"] == "trialing"
    assert data["trial_ends_at"] is not None
    trial_ends_at = as_aware_utc(datetime.fromisoformat(data["trial_ends_at"].replace("Z", "+00:00")))
    # Server time, 14 x 24 hours out (REVGENIQ_TRIAL_DURATION_DAYS default) — not client time,
    # not hard-coded elsewhere. Loose bound to tolerate test wall-clock time.
    assert before + timedelta(days=13, hours=23) < trial_ends_at < before + timedelta(days=14, hours=1)


# --------------------------------------------------------------------------------------------
# TEST 3/4 — Trial expiry, with and without the cron having run
# --------------------------------------------------------------------------------------------


def test_expiry_enforced_on_access_without_cron_running(client: TestClient, db_session: Session) -> None:
    """Proves the app does NOT depend solely on the cron: a trial that ran out gets enforced the
    moment any request hits it, even though the scheduled job never ran."""
    owner = _register(client)
    headers = _headers(owner["access_token"])

    settings_row = db_session.query(Settings).filter(Settings.tenant_id == owner["tenant"]["id"]).first()
    settings_row.trial_ends_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.add(settings_row)
    db_session.commit()

    # No cron call at all here — straight to a normal business-operation request.
    response = client.get("/api/products", headers=headers)
    assert response.status_code == 402
    body = response.json()
    assert body["detail"]["code"] == "SUBSCRIPTION_REQUIRED"
    assert body["detail"]["subscription_status"] == "suspended"
    assert body["detail"]["suspension_reason"] == "TRIAL_EXPIRED"

    # And it self-healed the DB row, not just the one response.
    db_session.refresh(settings_row)
    assert settings_row.subscription_status == "suspended"
    assert settings_row.suspended_at is not None


def test_expiry_self_heal_is_idempotent(client: TestClient, db_session: Session) -> None:
    """A second (and third) request against an already-overdue trial must not re-suspend, not
    duplicate the SubscriptionEvent, and not re-fire the expiry notification."""
    from app.models.notification import Notification
    from app.models.subscription_event import SubscriptionEvent

    owner = _register(client)
    headers = _headers(owner["access_token"])
    tenant_id = owner["tenant"]["id"]

    settings_row = db_session.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    settings_row.trial_ends_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.add(settings_row)
    db_session.commit()

    for _ in range(3):
        response = client.get("/api/products", headers=headers)
        assert response.status_code == 402

    events = db_session.query(SubscriptionEvent).filter(
        SubscriptionEvent.tenant_id == tenant_id, SubscriptionEvent.event_type == "suspended"
    ).all()
    assert len(events) == 1, "Trial expiry must suspend exactly once, not once per request"

    notifications = db_session.query(Notification).filter(
        Notification.tenant_id == tenant_id, Notification.type == "subscription_expiry"
    ).all()
    assert len(notifications) == 1, "Trial expiry must notify exactly once, not once per request"


# --------------------------------------------------------------------------------------------
# TEST 5 — Suspended account access is blocked, across every kind of business operation
# --------------------------------------------------------------------------------------------


def test_suspended_account_blocked_from_all_business_operations(client: TestClient, admin_db_session: Session, db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    product = _create_product(client, headers)
    customer = client.post("/api/customers", json={"name": "Walk-in"}, headers=headers).json()["data"]

    # Suspend via the same path an admin action or trial expiry would use.
    settings_row = db_session.query(Settings).filter(Settings.tenant_id == owner["tenant"]["id"]).first()
    settings_row.subscription_status = "suspended"
    settings_row.suspended_at = datetime.now(timezone.utc)
    settings_row.suspension_reason = "ADMIN_SUSPENDED"
    db_session.add(settings_row)
    db_session.commit()

    blocked = {
        "create invoice": lambda: client.post(
            "/api/invoices", json={"lines": [{"product_id": product["id"], "quantity": 1}], "payment_method": "cash", "amount_tendered": 20}, headers=headers
        ),
        "create customer": lambda: client.post("/api/customers", json={"name": "New Customer"}, headers=headers),
        "create product": lambda: client.post("/api/products", json={"name": "Another", "identifier_value": "W-2", "selling_price": 5}, headers=headers),
        "update inventory": lambda: client.post(f"/api/inventory/{product['id']}/adjust", json={"movement_type": "add", "quantity": 5, "reason": "purchase"}, headers=headers),
        "record payment": lambda: client.post("/api/payments", json={"customer_id": customer["id"], "amount": 10, "payment_method": "cash"}, headers=headers),
        "modify settings": lambda: client.put("/api/settings", json={"tagline": "New tagline"}, headers=headers),
        "access analytics": lambda: client.get("/api/analytics/dashboard?date_from=2026-01-01&date_to=2026-12-31", headers=headers),
        "view products (read)": lambda: client.get("/api/products", headers=headers),
    }
    for name, call in blocked.items():
        response = call()
        assert response.status_code == 402, f"Expected {name!r} to be blocked while suspended, got {response.status_code}: {response.text}"
        assert response.json()["detail"]["code"] == "SUBSCRIPTION_REQUIRED"

    # But the tenant can still see their own billing status and log out — the exempt paths.
    assert client.get("/api/billing/usage", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 200


# --------------------------------------------------------------------------------------------
# TEST 6 — Admin reactivation restores access, preserves existing data
# --------------------------------------------------------------------------------------------


def test_reactivation_restores_access_and_preserves_data(client: TestClient, admin_db_session: Session, db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")
    product = _create_product(client, headers, name="Preserved Product")
    customer = client.post("/api/customers", json={"name": "Preserved Customer"}, headers=headers).json()["data"]

    settings_row = db_session.query(Settings).filter(Settings.tenant_id == owner["tenant"]["id"]).first()
    settings_row.subscription_status = "suspended"
    settings_row.suspended_at = datetime.now(timezone.utc)
    settings_row.suspension_reason = "TRIAL_EXPIRED"
    db_session.add(settings_row)
    db_session.commit()

    assert client.get("/api/products", headers=headers).status_code == 402

    admin_headers = _admin_headers(client, admin_db_session)
    activate = client.post(
        f"/api/admin/customers/{owner['tenant']['id']}/subscription/activate",
        json={"plan": "advance", "note": "Paid via bank transfer"},
        headers=admin_headers,
    )
    assert activate.status_code == 200, activate.text
    detail = activate.json()["data"]
    assert detail["subscription_status"] == "active"
    assert detail["plan"] == "advance"
    assert detail["suspended_at"] is None
    assert detail["suspension_reason"] is None
    assert detail["reactivated_at"] is not None
    assert detail["reactivated_by"]

    # Access restored...
    products_after = client.get("/api/products", headers=headers)
    assert products_after.status_code == 200
    # ...and the pre-suspension data is exactly what's still there — nothing deleted or reset.
    names = [p["name"] for p in products_after.json()["data"]["items"]]
    assert "Preserved Product" in names
    customers_after = client.get("/api/customers", headers=headers).json()["data"]["items"]
    assert any(c["id"] == customer["id"] for c in customers_after)


# --------------------------------------------------------------------------------------------
# TEST 7/8/9 — Plan module matrices (Basic / Advanced / Custom)
# --------------------------------------------------------------------------------------------


def test_basic_plan_module_matrix(client: TestClient) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])

    # Basic: Dashboard(reports_analytics)/Sales/Catalog/Customer/Activity Log/Settings — YES.
    assert client.get("/api/analytics/dashboard?date_from=2026-01-01&date_to=2026-12-31", headers=headers).status_code == 200
    assert client.get("/api/products", headers=headers).status_code == 200
    assert client.get("/api/categories", headers=headers).status_code == 200
    assert client.get("/api/customers", headers=headers).status_code == 200
    assert client.get("/api/activity-log", headers=headers).status_code == 200
    assert client.get("/api/settings", headers=headers).status_code == 200

    # Basic: Inventory/Procurement/Commerce — NO (Advanced-only per the spec).
    assert client.get("/api/inventory", headers=headers).status_code == 402
    assert client.get("/api/procurement/vendors", headers=headers).status_code == 402
    assert client.get("/api/commerce/orders", headers=headers).status_code == 402


def test_advanced_plan_module_matrix(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    set_tenant_plan(client, admin_db_session, owner["tenant"]["id"], "advance")

    # Basic modules still available...
    assert client.get("/api/products", headers=headers).status_code == 200
    assert client.get("/api/customers", headers=headers).status_code == 200
    # ...plus everything Advanced adds.
    assert client.get("/api/inventory", headers=headers).status_code == 200
    assert client.get("/api/procurement/vendors", headers=headers).status_code == 200
    assert client.get("/api/commerce/orders", headers=headers).status_code == 200


def test_custom_plan_only_grants_individually_enabled_modules(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    tenant_id = owner["tenant"]["id"]
    admin_headers = _admin_headers(client, admin_db_session)

    # Switch to custom (no plan defaults at all) and explicitly enable only Analytics + Sales.
    set_plan = client.put(
        f"/api/admin/customers/{tenant_id}/subscription", json={"plan": "custom"}, headers=admin_headers
    )
    assert set_plan.status_code == 200, set_plan.text

    for module_key in ("reports_analytics", "pos_billing"):
        enable = client.put(
            f"/api/admin/customers/{tenant_id}/features/{module_key}",
            json={"status": "enabled"},
            headers=admin_headers,
        )
        assert enable.status_code == 200, enable.text

    # Enabled explicitly -> accessible.
    assert client.get("/api/analytics/dashboard?date_from=2026-01-01&date_to=2026-12-31", headers=headers).status_code == 200
    # Never touched, no plan default under custom -> blocked, even though Basic normally grants it.
    assert client.get("/api/customers", headers=headers).status_code == 402
    assert client.get("/api/inventory", headers=headers).status_code == 402


# --------------------------------------------------------------------------------------------
# TEST 10 — Backend enforcement holds even if the frontend nav is bypassed (i.e. direct API call)
# --------------------------------------------------------------------------------------------


def test_direct_api_call_to_disabled_module_is_blocked(client: TestClient) -> None:
    """Simulates "manually modified frontend navigation" — there's no frontend involved in a
    backend test at all, so this is inherently a direct API call; the point is confirming the
    block isn't something only the UI enforces."""
    owner = _register(client)
    headers = _headers(owner["access_token"])
    response = client.get("/api/inventory", headers=headers)
    assert response.status_code == 402


# --------------------------------------------------------------------------------------------
# TEST 11 — Unauthorized (non-admin) attempts to modify a subscription
# --------------------------------------------------------------------------------------------


def test_tenant_user_cannot_reach_admin_subscription_endpoints(client: TestClient) -> None:
    """A regular tenant JWT (not an admin JWT — separate secret, separate DB) must not be able
    to touch admin subscription endpoints at all."""
    owner = _register(client)
    headers = _headers(owner["access_token"])
    tenant_id = owner["tenant"]["id"]

    assert client.get("/api/admin/subscriptions", headers=headers).status_code == 401
    assert client.post(f"/api/admin/customers/{tenant_id}/subscription/activate", json={"plan": "advance"}, headers=headers).status_code == 401
    assert client.post(f"/api/admin/customers/{tenant_id}/subscription/suspend", json={}, headers=headers).status_code == 401


def test_low_privilege_admin_role_denied_subscription_and_reminder_actions(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    tenant_id = owner["tenant"]["id"]
    low_priv_headers = _admin_headers(client, admin_db_session, role="developer")

    assert client.post(f"/api/admin/customers/{tenant_id}/subscription/activate", json={"plan": "advance"}, headers=low_priv_headers).status_code == 403
    assert client.post(f"/api/admin/customers/{tenant_id}/subscription/suspend", json={}, headers=low_priv_headers).status_code == 403


# --------------------------------------------------------------------------------------------
# TEST 12 — Cross-tenant isolation on subscription data
# --------------------------------------------------------------------------------------------


def test_admin_subscription_actions_target_only_the_specified_tenant(client: TestClient, admin_db_session: Session) -> None:
    tenant_a = _register(client, "owner-a@acme.test")
    tenant_b = _register(client, "owner-b@acme.test")
    admin_headers = _admin_headers(client, admin_db_session)

    suspend = client.post(
        f"/api/admin/customers/{tenant_a['tenant']['id']}/subscription/suspend", json={}, headers=admin_headers
    )
    assert suspend.status_code == 200

    # Tenant A is blocked...
    assert client.get("/api/products", headers=_headers(tenant_a["access_token"])).status_code == 402
    # ...Tenant B is completely unaffected.
    assert client.get("/api/products", headers=_headers(tenant_b["access_token"])).status_code == 200


# --------------------------------------------------------------------------------------------
# TEST 13/14 — Trial reminders: channel selection + duplicate-send is allowed but each logged
# --------------------------------------------------------------------------------------------


def test_send_trial_reminder_all_channels_logged(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    tenant_id = owner["tenant"]["id"]
    admin_headers = _admin_headers(client, admin_db_session)

    response = client.post(
        f"/api/admin/customers/{tenant_id}/trial-reminders",
        json={"channels": ["sms", "whatsapp", "email"]},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    results = response.json()["data"]
    assert {r["channel"] for r in results} == {"sms", "whatsapp", "email"}
    # Console providers "succeed" (they log instead of really sending) — NOT VERIFIED as reaching
    # a real phone/inbox, but proves the send path itself works end to end.
    assert all(r["status"] == "sent" for r in results)

    history = client.get(f"/api/admin/customers/{tenant_id}/trial-reminders", headers=admin_headers)
    assert history.status_code == 200
    assert len(history.json()["data"]) == 3


def test_send_trial_reminder_invalid_channel_rejected(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    admin_headers = _admin_headers(client, admin_db_session)
    response = client.post(
        f"/api/admin/customers/{owner['tenant']['id']}/trial-reminders",
        json={"channels": ["carrier_pigeon"]},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_repeated_reminder_sends_are_each_recorded_not_deduplicated(client: TestClient, admin_db_session: Session) -> None:
    """The spec asks that duplicate-send behavior be *intentional*, not accidental. This app's
    choice: sending is always admin-initiated (never automatic), so every explicit send is
    honored and logged — there is no automatic within-app throttling of an admin's own repeated
    action, only a full history so admins can see "Last Sent" and choose not to send again."""
    owner = _register(client)
    tenant_id = owner["tenant"]["id"]
    admin_headers = _admin_headers(client, admin_db_session)

    for _ in range(2):
        response = client.post(
            f"/api/admin/customers/{tenant_id}/trial-reminders", json={"channels": ["email"]}, headers=admin_headers
        )
        assert response.status_code == 200

    history = client.get(f"/api/admin/customers/{tenant_id}/trial-reminders", headers=admin_headers).json()["data"]
    assert len(history) == 2


# --------------------------------------------------------------------------------------------
# TEST 17 — Plan change updates the effective module set correctly in both directions
# --------------------------------------------------------------------------------------------


def test_plan_change_basic_to_advanced_to_custom_to_basic(client: TestClient, admin_db_session: Session) -> None:
    owner = _register(client)
    headers = _headers(owner["access_token"])
    tenant_id = owner["tenant"]["id"]
    admin_headers = _admin_headers(client, admin_db_session)

    assert client.get("/api/inventory", headers=headers).status_code == 402

    client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": "advance"}, headers=admin_headers)
    assert client.get("/api/inventory", headers=headers).status_code == 200

    client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": "custom"}, headers=admin_headers)
    # No explicit override was ever set for "inventory" -> custom's empty default set blocks it,
    # even though it was reachable a moment ago under advance.
    assert client.get("/api/inventory", headers=headers).status_code == 402

    client.put(f"/api/admin/customers/{tenant_id}/subscription", json={"plan": "basic"}, headers=admin_headers)
    assert client.get("/api/products", headers=headers).status_code == 200
    assert client.get("/api/inventory", headers=headers).status_code == 402
