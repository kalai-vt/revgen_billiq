"""One-off bootstrap script: creates the first RevGenIQ Super Admin account.

There is no public self-registration endpoint for the Admin Portal (admin accounts are either
bootstrapped this way or, in a later phase, invited by an existing Super Admin) — employee
credentials should never be created through an open signup flow.

Usage (run from the database/ directory so `app.*` imports resolve, same as alembic_admin.ini):
    ../backend/.venv/Scripts/python.exe create_super_admin.py \
        --email owner@revgeniq.com --password "StrongPass!123" \
        --first-name Ada --last-name Lovelace
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.core.admin_db import AdminSessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models_admin.admin_user import ADMIN_ROLES, AdminUser  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first RevGenIQ Admin Portal Super Admin.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--first-name", required=True)
    parser.add_argument("--last-name", required=True)
    parser.add_argument("--role", default="super_admin", choices=ADMIN_ROLES)
    args = parser.parse_args()

    db = AdminSessionLocal()
    try:
        existing = db.query(AdminUser).filter(AdminUser.email == args.email).first()
        if existing:
            print(f"An admin user with email {args.email!r} already exists (id={existing.id}). Nothing to do.")
            return

        admin = AdminUser(
            first_name=args.first_name,
            last_name=args.last_name,
            email=args.email,
            password_hash=hash_password(args.password),
            role=args.role,
            status="active",
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print(f"Created admin user {admin.email!r} (id={admin.id}, role={admin.role}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
