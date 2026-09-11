"""A module's stored switch versus what the customer actually gets.

The API already refuses to enable a module whose prerequisite is off, so an admin cannot create
that mismatch through the portal — that guard is the first test here, because it is the one that
matters.

`effective_status` exists for the cases the guard cannot cover: a flag written directly to the
database, or a catalog change that adds a `requires` to a module tenants already have switched on.
Those produce a module that reads "Enabled" while the customer gets a 402, and without this the
page gives an admin nothing to go on.
"""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.feature_flag import TenantFeatureFlag
from tests.test_admin_features import _admin_headers, _register_tenant


def _features(client: TestClient, admin_headers: dict, tenant_id: str) -> dict:
    items = client.get(f"/api/admin/customers/{tenant_id}/features", headers=admin_headers).json()["data"]
    items = items["items"] if isinstance(items, dict) else items
    return {i["module_key"]: i for i in items}


def test_enabling_a_module_whose_prerequisite_is_off_is_refused(
    client: TestClient, admin_db_session: Session
):
    """The guard that stops the mismatch existing in the first place."""
    admin_headers = _admin_headers(client, admin_db_session)
    tid = _register_tenant(client)["tenant"]["id"]

    refused = client.put(
        f"/api/admin/customers/{tid}/features/advanced_analytics",
        json={"status": "enabled", "reason": "test"},
        headers=admin_headers,
    )
    assert refused.status_code == 422
    assert "requires Analytics" in refused.json()["detail"]
    assert _features(client, admin_headers, tid)["advanced_analytics"]["status"] == "disabled"


def test_effective_status_surfaces_drift_the_guard_cannot_prevent(
    client: TestClient, db_session: Session, admin_db_session: Session
):
    """A flag written straight to the database bypasses the guard. The page has to notice."""
    admin_headers = _admin_headers(client, admin_db_session)
    tid = _register_tenant(client)["tenant"]["id"]

    db_session.add(
        TenantFeatureFlag(tenant_id=tid, module_key="advanced_analytics", status="enabled")
    )
    db_session.commit()

    item = _features(client, admin_headers, tid)["advanced_analytics"]
    assert item["status"] == "enabled", "its own switch reads on"
    assert item["effective_status"] == "disabled", "but the customer cannot use it"
    assert "Analytics" in item["blocked_by_labels"]


def test_effective_matches_stored_when_nothing_blocks_it(
    client: TestClient, admin_db_session: Session
):
    admin_headers = _admin_headers(client, admin_db_session)
    tid = _register_tenant(client)["tenant"]["id"]
    client.put(
        f"/api/admin/customers/{tid}/features/restaurant",
        json={"status": "enabled", "reason": "test"},
        headers=admin_headers,
    )
    item = _features(client, admin_headers, tid)["restaurant"]
    assert item["effective_status"] == item["status"] == "enabled"
    assert item["blocked_by_labels"] == []


def test_blocking_is_transitive(client: TestClient, admin_db_session: Session):
    """kot requires restaurant, and turning restaurant off has to reach kot's dependents too."""
    admin_headers = _admin_headers(client, admin_db_session)
    tid = _register_tenant(client)["tenant"]["id"]
    for key in ("restaurant", "kot", "table_management", "table_merge"):
        client.put(
            f"/api/admin/customers/{tid}/features/{key}",
            json={"status": "enabled", "reason": "test"},
            headers=admin_headers,
        )
    client.put(
        f"/api/admin/customers/{tid}/features/restaurant",
        json={"status": "disabled", "reason": "test", "force": True},
        headers=admin_headers,
    )
    items = _features(client, admin_headers, tid)
    assert items["kot"]["effective_status"] == "disabled"
    assert items["table_merge"]["effective_status"] == "disabled"
