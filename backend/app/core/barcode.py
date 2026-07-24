from __future__ import annotations

import secrets

from sqlalchemy.orm import Session

from app.models.catalog import Product


def _check_digit(digits: str) -> int:
    total = 0
    for i, ch in enumerate(digits):
        n = int(ch)
        total += n if i % 2 == 0 else n * 3
    return (10 - (total % 10)) % 10


def generate_ean13(db: Session) -> str:
    """Generates a real, checksummed EAN-13 barcode value, retried on collision against any
    existing Product.barcode (barcode uniqueness is checked globally today, matching the
    existing `_assert_barcode_available` validator)."""
    for _ in range(20):
        base = "".join(str(secrets.randbelow(10)) for _ in range(12))
        candidate = base + str(_check_digit(base))
        if not db.query(Product.id).filter(Product.barcode == candidate).first():
            return candidate
    raise RuntimeError("Could not generate a unique barcode after 20 attempts")
