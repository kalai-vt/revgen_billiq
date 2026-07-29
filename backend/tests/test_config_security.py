from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import DEFAULT_ADMIN_JWT_SECRET, DEFAULT_COMMERCE_ENCRYPTION_KEY, DEFAULT_JWT_SECRET, Settings


def test_wildcard_cors_origin_is_rejected() -> None:
    with pytest.raises(ValidationError, match="cannot include '\\*'"):
        Settings(_env_file=None, cors_origins="*", jwt_secret="a" * 40)


def test_wildcard_cors_origin_rejected_even_alongside_real_origins() -> None:
    with pytest.raises(ValidationError, match="cannot include '\\*'"):
        Settings(_env_file=None, cors_origins="http://example.com,*", jwt_secret="a" * 40)


def test_production_requires_non_default_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="REVGENIQ_JWT_SECRET must be set"):
        Settings(_env_file=None, environment="production", jwt_secret=DEFAULT_JWT_SECRET)


def test_production_requires_sufficiently_long_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="REVGENIQ_JWT_SECRET must be set"):
        Settings(_env_file=None, environment="production", jwt_secret="too-short")


def test_production_accepts_strong_jwt_secret() -> None:
    settings = Settings(
        _env_file=None,
        environment="production",
        jwt_secret="a" * 40,
        admin_jwt_secret="b" * 40,
        commerce_encryption_key="c" * 44,
    )
    assert settings.jwt_secret == "a" * 40
    assert settings.admin_jwt_secret == "b" * 40
    assert settings.commerce_encryption_key == "c" * 44


def test_production_requires_non_default_admin_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="REVGENIQ_ADMIN_JWT_SECRET must be set"):
        Settings(
            _env_file=None,
            environment="production",
            jwt_secret="a" * 40,
            admin_jwt_secret=DEFAULT_ADMIN_JWT_SECRET,
            commerce_encryption_key="c" * 44,
        )


def test_production_requires_sufficiently_long_admin_jwt_secret() -> None:
    with pytest.raises(ValidationError, match="REVGENIQ_ADMIN_JWT_SECRET must be set"):
        Settings(
            _env_file=None,
            environment="production",
            jwt_secret="a" * 40,
            admin_jwt_secret="too-short",
            commerce_encryption_key="c" * 44,
        )


def test_production_requires_non_default_commerce_encryption_key() -> None:
    with pytest.raises(ValidationError, match="REVGENIQ_COMMERCE_ENCRYPTION_KEY must be set"):
        Settings(
            _env_file=None,
            environment="production",
            jwt_secret="a" * 40,
            admin_jwt_secret="b" * 40,
            commerce_encryption_key=DEFAULT_COMMERCE_ENCRYPTION_KEY,
        )


def test_development_allows_default_commerce_encryption_key_with_warning() -> None:
    with pytest.warns(UserWarning, match="default REVGENIQ_COMMERCE_ENCRYPTION_KEY"):
        settings = Settings(_env_file=None, environment="development", commerce_encryption_key=DEFAULT_COMMERCE_ENCRYPTION_KEY)
    assert settings.commerce_encryption_key == DEFAULT_COMMERCE_ENCRYPTION_KEY


def test_development_allows_default_secret_with_warning() -> None:
    with pytest.warns(UserWarning, match="default REVGENIQ_JWT_SECRET"):
        settings = Settings(_env_file=None, environment="development", jwt_secret=DEFAULT_JWT_SECRET)
    assert settings.jwt_secret == DEFAULT_JWT_SECRET


def test_development_allows_default_admin_secret_with_warning() -> None:
    with pytest.warns(UserWarning, match="default REVGENIQ_ADMIN_JWT_SECRET"):
        settings = Settings(_env_file=None, environment="development", admin_jwt_secret=DEFAULT_ADMIN_JWT_SECRET)
    assert settings.admin_jwt_secret == DEFAULT_ADMIN_JWT_SECRET
