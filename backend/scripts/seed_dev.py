"""Creates a ready-to-use local dev tenant so the app can be logged into and clicked through.

Registering through the UI gets you a tenant you cannot actually test the restaurant features
with, for two reasons this script exists to solve:

  * The owner lands in `pending_verification` and the verification email goes to the console
    provider in dev, so there's a link to hunt for in the backend logs before the first login.
  * Restaurant/table/KOT are deliberately NOT in any plan's defaults (a pharmacy shouldn't get
    table management), so a fresh tenant sees no Restaurant section at all until a Super Admin
    enables it per tenant.

So this seeds a verified owner, switches the restaurant modules on for that tenant the same way
the Admin Portal would, and puts enough menu/floor/table data in to exercise a real order.

DEVELOPMENT ONLY. It refuses to run against a production environment, and the credentials it
creates are intentionally well-known — never run it anywhere real users can reach.

    cd backend
    python -m scripts.seed_dev

Override the defaults with SEED_EMAIL / SEED_PASSWORD if you want different ones.
"""
from __future__ import annotations

import os

from app.core.config import settings as app_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.catalog import Product
from app.models.feature_flag import TenantFeatureFlag
from app.models.restaurant import RestaurantFloor, RestaurantTable
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.models.user import User
from app.modules.settings.service import create_default_settings

SEED_EMAIL = os.environ.get("SEED_EMAIL", "owner@ogcafe.test")
SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "DevPassword@123")
SEED_PHONE = os.environ.get("SEED_PHONE", "9000000001")
SEED_COMPANY = "OG Cafe (dev)"

# Everything the restaurant work needs, plus the payment QR. These are exactly the switches the
# Admin Portal's Feature Management page flips — this just does it without the round trip.
SEED_MODULES = [
    "restaurant",
    "floor_management",
    "table_management",
    "kot",
    "table_transfer",
    "table_merge",
    "table_split",
    "restaurant_reports",
    "qr_payments",
]

MENU = [
    ("Masala Dosa", "MD-01", 120.0, 5.0),
    ("Filter Coffee", "FC-01", 40.0, 5.0),
    ("Paneer Butter Masala", "PBM-01", 260.0, 5.0),
    ("Butter Naan", "BN-01", 45.0, 5.0),
    ("Gulab Jamun", "GJ-01", 60.0, 5.0),
]


def _guard_not_production() -> None:
    environment = (app_settings.environment or "").lower()
    if environment.startswith("prod"):
        raise SystemExit(
            "seed_dev refuses to run with REVGENIQ_ENVIRONMENT="
            f"{app_settings.environment!r}. It creates a well-known password on purpose."
        )


def main() -> None:
    _guard_not_production()
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == SEED_EMAIL).first()
        if existing:
            tenant = db.get(Tenant, existing.tenant_id)
            print(f"Seed tenant already exists ({SEED_EMAIL}) — refreshing its feature flags only.")
        else:
            tenant = Tenant(
                company_name=SEED_COMPANY,
                legal_name=SEED_COMPANY,
                email=SEED_EMAIL,
                phone=SEED_PHONE,
                country="IN",
                timezone="Asia/Kolkata",
            )
            db.add(tenant)
            db.flush()
            create_default_settings(db, tenant.id, currency="INR")

            db.add(
                User(
                    tenant_id=tenant.id,
                    first_name="Dev",
                    last_name="Owner",
                    email=SEED_EMAIL,
                    mobile=SEED_PHONE,
                    password_hash=hash_password(SEED_PASSWORD),
                    role="owner",
                    # Verified outright: in dev the verification mail only reaches the console,
                    # and hunting a link out of the log before every first login is friction with
                    # nothing to test in it.
                    status="active",
                    is_email_verified=True,
                )
            )
            db.flush()

        # Feature flags — idempotent, so re-running repairs a tenant someone toggled off.
        for module_key in SEED_MODULES:
            flag = (
                db.query(TenantFeatureFlag)
                .filter(TenantFeatureFlag.tenant_id == tenant.id, TenantFeatureFlag.module_key == module_key)
                .first()
            )
            if flag:
                flag.status = "enabled"
            else:
                flag = TenantFeatureFlag(tenant_id=tenant.id, module_key=module_key, status="enabled")
            flag.reason = "Local dev seed"
            db.add(flag)

        # A VPA, so the payment QR renders instead of being correctly omitted as unpayable.
        tenant_settings = db.query(Settings).filter(Settings.tenant_id == tenant.id).first()
        if tenant_settings and not tenant_settings.upi_vpa:
            tenant_settings.upi_vpa = "ogcafe@okaxis"
            tenant_settings.upi_merchant_name = SEED_COMPANY
            db.add(tenant_settings)

        if not db.query(Product).filter(Product.tenant_id == tenant.id).first():
            for name, code, price, tax in MENU:
                db.add(
                    Product(
                        tenant_id=tenant.id,
                        name=name,
                        identifier_type="pid",
                        identifier_value=code,
                        cost_price=round(price * 0.4, 2),
                        selling_price=price,
                        tax_rate_percent=tax,
                    )
                )

        if not db.query(RestaurantFloor).filter(RestaurantFloor.tenant_id == tenant.id).first():
            floor = RestaurantFloor(tenant_id=tenant.id, name="Ground Floor", sort_order=1)
            db.add(floor)
            db.flush()
            for number in range(1, 7):
                db.add(
                    RestaurantTable(
                        tenant_id=tenant.id,
                        floor_id=floor.id,
                        name=str(number),
                        seats=4,
                        sort_order=number,
                    )
                )

        db.commit()
    finally:
        db.close()

    print("\nLocal dev tenant ready.\n")
    print(f"  Billing app   http://localhost:5173")
    print(f"  Email         {SEED_EMAIL}")
    print(f"  Password      {SEED_PASSWORD}")
    print("\n  Restaurant modules enabled: " + ", ".join(SEED_MODULES))
    print("  Menu items, one floor and 6 tables seeded.")
    print("\n  Admin Portal   http://localhost:5174  (run `python -m scripts.bootstrap_admin` for its login)\n")


if __name__ == "__main__":
    main()
