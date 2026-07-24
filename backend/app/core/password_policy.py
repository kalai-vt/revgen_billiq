from __future__ import annotations

import re


def validate_password_strength(password: str) -> str:
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters long")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must include at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must include at least one lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must include at least one number")
    if not re.search(r"[^\w\s]", password):
        raise ValueError("Password must include at least one special character")
    return password
