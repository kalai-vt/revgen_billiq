"""Creates the first super_admin AdminUser account for a fresh deploy.

There is no other way to get a first admin into the system: every other admin-creation path
(`admin_staff.service.invite_staff`) requires being authenticated as an existing super_admin,
which is a chicken-and-egg problem on a brand new database. This script is the way out of that —
safe to run any number of times: it does nothing once at least one admin user already exists.

Usage (from backend/, with the venv active and REVGENIQ_ADMIN_DATABASE_URL pointed at the target
database — e.g. set the same env vars the deployed app uses):

    python -m scripts.bootstrap_admin

Reads credentials from environment variables so this can run non-interactively in a deploy
pipeline; falls back to interactive prompts for anything not set:

    BOOTSTRAP_ADMIN_EMAIL
    BOOTSTRAP_ADMIN_PASSWORD
    BOOTSTRAP_ADMIN_FIRST_NAME  (default: "Super")
    BOOTSTRAP_ADMIN_LAST_NAME   (default: "Admin")
"""
from __future__ import annotations

import getpass
import os
import sys

from app.core.admin_db import AdminSessionLocal
from app.core.security import hash_password
from app.models_admin.admin_user import AdminUser


def _prompt(env_var: str, label: str, *, default: str | None = None, secret: bool = False) -> str:
    value = os.environ.get(env_var)
    if value:
        return value
    if not sys.stdin.isatty():
        if default is not None:
            return default
        raise SystemExit(f"{env_var} must be set (no interactive terminal available to prompt for {label}).")
    prompt = f"{label}" + (f" [{default}]" if default else "") + ": "
    entered = getpass.getpass(prompt) if secret else input(prompt)
    return entered or (default or "")


def main() -> None:
    db = AdminSessionLocal()
    try:
        existing_count = db.query(AdminUser).count()
        if existing_count > 0:
            print(f"{existing_count} admin user(s) already exist — nothing to do. "
                  "Use the admin portal's Staff page to invite additional admins.")
            return

        email = _prompt("BOOTSTRAP_ADMIN_EMAIL", "Super admin email")
        password = _prompt("BOOTSTRAP_ADMIN_PASSWORD", "Super admin password", secret=True)
        first_name = _prompt("BOOTSTRAP_ADMIN_FIRST_NAME", "First name", default="Super")
        last_name = _prompt("BOOTSTRAP_ADMIN_LAST_NAME", "Last name", default="Admin")

        if len(password) < 10:
            raise SystemExit("Password must be at least 10 characters.")

        admin = AdminUser(
            first_name=first_name,
            last_name=last_name,
            email=email,
            password_hash=hash_password(password),
            role="super_admin",
            status="active",
        )
        db.add(admin)
        db.commit()
        print(f"Created super_admin account for {email}. Sign in at the admin portal and invite the rest of your team from there.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
