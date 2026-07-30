from __future__ import annotations

import base64

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

from app.core.config import settings

# Must match the frontend's qz.security.setSignatureAlgorithm('SHA512') call in
# lib/printing/qzTraySigning.ts — QZ Tray verifies the signature using whichever algorithm the
# frontend told it to expect, independent of what the backend actually signs with, so the two
# have to agree.
_HASH_ALGORITHM = hashes.SHA512()


class QzSigningError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


def is_configured() -> bool:
    return bool(settings.qz_tray_private_key and settings.qz_tray_certificate)


def get_certificate() -> str:
    return settings.qz_tray_certificate


_private_key: RSAPrivateKey | None = None


def _get_private_key() -> RSAPrivateKey:
    global _private_key
    if _private_key is None:
        try:
            key = serialization.load_pem_private_key(settings.qz_tray_private_key.encode(), password=None)
        except ValueError as exc:
            raise QzSigningError("REVGENIQ_QZ_TRAY_PRIVATE_KEY is not a valid PEM private key.") from exc
        if not isinstance(key, RSAPrivateKey):
            raise QzSigningError("REVGENIQ_QZ_TRAY_PRIVATE_KEY must be an RSA private key.")
        _private_key = key
    return _private_key


def sign(to_sign: str) -> str:
    if not is_configured():
        raise QzSigningError("QZ Tray signing isn't configured for this deployment.")
    signature = _get_private_key().sign(to_sign.encode(), padding.PKCS1v15(), _HASH_ALGORITHM)
    return base64.b64encode(signature).decode()
