from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone


def _seed_admin(admin_db_session: Session, email: str = "owner@revgeniq.com", role: str = "super_admin") -> AdminUser:
    admin = AdminUser(
        first_name="Riya",
        last_name="Nair",
        email=email,
        password_hash=hash_password("AdminPass!123"),
        role=role,
        status="active",
    )
    admin_db_session.add(admin)
    admin_db_session.commit()
    admin_db_session.refresh(admin)
    return admin


def _admin_headers(client: TestClient, admin_db_session: Session, role: str = "super_admin") -> dict:
    _seed_admin(admin_db_session, role=role)
    login = client.post("/api/admin/auth/login", json={"email": "owner@revgeniq.com", "password": "AdminPass!123"})
    token = login.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _register_tenant(client: TestClient, email: str = "owner@acme.test") -> dict:
    return register_and_activate_standalone(
        client,
        {
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
        },
    )


def test_feature_flags_default_all_enabled_for_available_modules(
    client: TestClient, admin_db_session: Session
) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.get(f"/api/admin/customers/{tenant_id}/features", headers=headers)
    assert response.status_code == 200, response.text
    flags = response.json()["data"]
    available = [f for f in flags if f["available"]]
    coming_soon = [f for f in flags if not f["available"]]
    assert all(f["enabled"] for f in available)
    assert all(not f["enabled"] for f in coming_soon)
    assert any(f["module_key"] == "pos_billing" for f in available)
    assert any(f["module_key"] == "crm" for f in coming_soon)


def test_toggle_feature_flag_persists_and_reflects_in_billing_app(
    client: TestClient, admin_db_session: Session
) -> None:
    admin_headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    update = client.put(
        f"/api/admin/customers/{tenant_id}/features",
        json={"module_key": "inventory", "enabled": False},
        headers=admin_headers,
    )
    assert update.status_code == 200, update.text

    flags = client.get(f"/api/admin/customers/{tenant_id}/features", headers=admin_headers).json()["data"]
    inventory_flag = next(f for f in flags if f["module_key"] == "inventory")
    assert inventory_flag["enabled"] is False

    tenant_headers = {"Authorization": f"Bearer {owner['access_token']}"}
    billing_flags = client.get("/api/feature-flags", headers=tenant_headers).json()["data"]
    assert billing_flags["inventory"] is False
    assert billing_flags["pos_billing"] is True


def test_toggling_unavailable_module_is_rejected(client: TestClient, admin_db_session: Session) -> None:
    admin_headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.put(
        f"/api/admin/customers/{tenant_id}/features",
        json={"module_key": "crm", "enabled": True},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_update_feature_flag_requires_operations_or_super_admin_role(
    client: TestClient, admin_db_session: Session
) -> None:
    headers = _admin_headers(client, admin_db_session, role="support")
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]

    response = client.put(
        f"/api/admin/customers/{tenant_id}/features",
        json={"module_key": "inventory", "enabled": False},
        headers=headers,
    )
    assert response.status_code == 403
