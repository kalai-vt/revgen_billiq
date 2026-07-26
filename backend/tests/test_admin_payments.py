from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.customer import Customer
from app.models.payment import Payment
from app.models_admin.admin_user import AdminUser
from tests.conftest import register_and_activate_standalone


def _admin_headers(client: TestClient, admin_db_session: Session) -> dict:
    admin = AdminUser(
        first_name="Riya", last_name="Nair", email="owner@revgeniq.com",
        password_hash=hash_password("AdminPass!123"), role="super_admin", status="active",
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


def test_list_payments_and_summary(client: TestClient, admin_db_session: Session, db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]
    user_id = owner["user"]["id"]

    customer = Customer(tenant_id=tenant_id, name="Walk-in Customer")
    db_session.add(customer)
    db_session.commit()

    payment = Payment(
        tenant_id=tenant_id,
        customer_id=customer.id,
        payment_number="PMT-0001",
        amount=1500.0,
        payment_method="cash",
        received_by=user_id,
    )
    db_session.add(payment)
    db_session.commit()

    listing = client.get("/api/admin/payments", headers=headers)
    assert listing.status_code == 200, listing.text
    items = listing.json()["data"]["items"]
    assert any(row["payment_number"] == "PMT-0001" and row["company_name"] == "Acme Retail" for row in items)

    summary = client.get("/api/admin/payments/summary", headers=headers)
    assert summary.status_code == 200
    data = summary.json()["data"]
    assert data["collected_all_time"] >= 1500.0
    assert data["by_method"]["cash"] >= 1500.0


def test_filter_payments_by_tenant(client: TestClient, admin_db_session: Session, db_session: Session) -> None:
    headers = _admin_headers(client, admin_db_session)
    owner = _register_tenant(client)
    tenant_id = owner["tenant"]["id"]
    other_tenant_id = "not-a-real-tenant"

    customer = Customer(tenant_id=tenant_id, name="Walk-in Customer")
    db_session.add(customer)
    db_session.commit()
    db_session.add(
        Payment(
            tenant_id=tenant_id,
            customer_id=customer.id,
            payment_number="PMT-0002",
            amount=200.0,
            payment_method="upi",
            received_by=owner["user"]["id"],
        )
    )
    db_session.commit()

    response = client.get(f"/api/admin/payments?tenant_id={other_tenant_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["items"] == []
