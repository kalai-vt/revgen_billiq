from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import DEFAULT_JWT_SECRET, Settings


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
    settings = Settings(_env_file=None, environment="production", jwt_secret="a" * 40)
    assert settings.jwt_secret == "a" * 40


def test_development_allows_default_secret_with_warning() -> None:
    with pytest.warns(UserWarning, match="default REVGENIQ_JWT_SECRET"):
        settings = Settings(_env_file=None, environment="development", jwt_secret=DEFAULT_JWT_SECRET)
    assert settings.jwt_secret == DEFAULT_JWT_SECRET
