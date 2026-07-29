from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(settings.commerce_encryption_key.encode())
    return _fernet


def encrypt_secret(value: str) -> str:
    """Encrypts a Commerce Integration credential (API key/secret) before storing it — the only
    place in this codebase secrets are encrypted at rest rather than stored plaintext, since these
    are real third-party revenue-affecting credentials rather than internal config."""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Could not decrypt stored credential — the encryption key may have changed.") from exc
