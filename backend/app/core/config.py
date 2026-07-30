from __future__ import annotations

import warnings

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "dev-secret-change-me"
DEFAULT_ADMIN_JWT_SECRET = "dev-admin-secret-change-me"
# Must be a valid Fernet key (32 url-safe base64-encoded bytes) — used only to encrypt Commerce
# Integration credentials (Swiggy/Zomato API keys) at rest, see app/core/crypto.py.
DEFAULT_COMMERCE_ENCRYPTION_KEY = "S40qXQRZk1f2WcBLZm-NmtYFNEPMck6khtLR9M_RoHc="


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REVGENIQ_", env_file=".env", env_file_encoding="utf-8")

    environment: str = "development"
    database_url: str = "sqlite:///./app.db"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    # RevGenIQ Admin Portal: a separate database and a separate JWT secret from the tenant-facing
    # Billing app, so a leak of one credential store can't be used to forge tokens for the other.
    admin_database_url: str = "sqlite:///./admin.db"
    admin_jwt_secret: str = DEFAULT_ADMIN_JWT_SECRET
    commerce_encryption_key: str = DEFAULT_COMMERCE_ENCRYPTION_KEY
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    remember_me_refresh_token_expire_days: int = 30
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    app_url: str = "http://localhost:5173"
    admin_portal_url: str = "http://localhost:5174"
    email_provider: str = "console"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    email_from: str = "no-reply@revgeniq.local"
    resend_api_key: str = ""
    verification_token_expiry_hours: int = 24
    password_reset_expiry_minutes: int = 15
    support_email: str = "support@revgeniq.com"

    # Error tracking. Empty string (the default) means Sentry is never initialized — see
    # app/core/observability.py. No account/DSN required to run this app; set this to activate.
    sentry_dsn: str = ""

    # Razorpay subscription billing. All three empty (the default) means the checkout/webhook
    # endpoints return a clear "billing isn't configured" error instead of calling Razorpay — see
    # app/core/payments/razorpay_client.py. Subscriptions keep working in the existing
    # admin-managed-only mode until these are set.
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    @model_validator(mode="after")
    def _guard_insecure_settings(self) -> "Settings":
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        if "*" in origins:
            # The API is always served with allow_credentials=True (see main.py), so a wildcard
            # origin would let any website make authenticated requests using a logged-in user's
            # token — this is never correct here, in any environment.
            raise ValueError(
                "REVGENIQ_CORS_ORIGINS cannot include '*' because the API allows credentialed "
                "requests. List explicit origins instead (comma-separated)."
            )

        if self.environment == "production":
            if self.jwt_secret == DEFAULT_JWT_SECRET or len(self.jwt_secret) < 32:
                raise ValueError(
                    "REVGENIQ_JWT_SECRET must be set to a strong, unique value (32+ characters) "
                    "when REVGENIQ_ENVIRONMENT=production. Generate one with: "
                    'python -c "import secrets; print(secrets.token_hex(32))"'
                )
            if self.admin_jwt_secret == DEFAULT_ADMIN_JWT_SECRET or len(self.admin_jwt_secret) < 32:
                raise ValueError(
                    "REVGENIQ_ADMIN_JWT_SECRET must be set to a strong, unique value (32+ characters) "
                    "when REVGENIQ_ENVIRONMENT=production. Generate one with: "
                    'python -c "import secrets; print(secrets.token_hex(32))"'
                )
            if self.commerce_encryption_key == DEFAULT_COMMERCE_ENCRYPTION_KEY:
                raise ValueError(
                    "REVGENIQ_COMMERCE_ENCRYPTION_KEY must be set to a unique Fernet key when "
                    "REVGENIQ_ENVIRONMENT=production. Generate one with: "
                    'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
                )
            if self.email_provider not in ("resend", "smtp"):
                # `app/core/email/factory.py` falls back to the no-op console provider for
                # *anything* that isn't "resend" or "smtp" — including "console" itself, an unset
                # value, or a typo'd one. This used to only warn on the literal "console" case,
                # which is exactly how "verification/reset emails never arrive" reports happened
                # in practice: an empty/misspelled value warned about nothing and still silently
                # dropped every email. Now any non-real provider hard-fails, like the checks above.
                raise ValueError(
                    f"REVGENIQ_EMAIL_PROVIDER={self.email_provider!r} while REVGENIQ_ENVIRONMENT=production — "
                    "verification and password-reset emails would NOT be delivered, only printed to logs. "
                    "Set REVGENIQ_EMAIL_PROVIDER to 'resend' or 'smtp' with matching credentials."
                )
        else:
            if self.jwt_secret == DEFAULT_JWT_SECRET:
                warnings.warn(
                    "Using the default REVGENIQ_JWT_SECRET. This is only safe for local development — "
                    "set REVGENIQ_JWT_SECRET to a real secret before deploying anywhere reachable.",
                    stacklevel=2,
                )
            if self.admin_jwt_secret == DEFAULT_ADMIN_JWT_SECRET:
                warnings.warn(
                    "Using the default REVGENIQ_ADMIN_JWT_SECRET. This is only safe for local "
                    "development — set REVGENIQ_ADMIN_JWT_SECRET to a real secret before deploying "
                    "anywhere reachable.",
                    stacklevel=2,
                )
            if self.commerce_encryption_key == DEFAULT_COMMERCE_ENCRYPTION_KEY:
                warnings.warn(
                    "Using the default REVGENIQ_COMMERCE_ENCRYPTION_KEY. This is only safe for local "
                    "development — set REVGENIQ_COMMERCE_ENCRYPTION_KEY to a real Fernet key before "
                    "deploying anywhere reachable.",
                    stacklevel=2,
                )
        return self


settings = Settings()
