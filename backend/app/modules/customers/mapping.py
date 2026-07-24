from __future__ import annotations

CANONICAL_FIELDS = ["name", "mobile", "email", "address"]

CANONICAL_LABELS = {
    "name": "Name",
    "mobile": "Mobile",
    "email": "Email",
    "address": "Address",
}

# Case-insensitive header synonyms so files "from different suppliers" auto-map
# whenever possible; anything not recognized here falls through to the manual
# Column Mapping screen.
_SYNONYMS: dict[str, list[str]] = {
    "name": ["name", "customer name", "full name"],
    "mobile": ["mobile", "phone", "phone number", "mobile number", "contact"],
    "email": ["email", "email address", "e-mail"],
    "address": ["address", "location"],
}


def auto_map(headers: list[str]) -> dict[str, str | None]:
    normalized = {header: header.strip().lower() for header in headers}
    mapping: dict[str, str | None] = dict.fromkeys(CANONICAL_FIELDS)
    for field, synonyms in _SYNONYMS.items():
        for header, norm in normalized.items():
            if norm in synonyms:
                mapping[field] = header
                break
    return mapping


def mapping_is_complete(mapping: dict[str, str | None]) -> bool:
    if not mapping.get("name"):
        return False
    return bool(mapping.get("mobile")) or bool(mapping.get("email"))
