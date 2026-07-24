from __future__ import annotations

_FORMULA_TRIGGER_CHARS = ("=", "+", "-", "@", "\t", "\r")


def escape_formula(value: object) -> str:
    """Neutralize CSV/Excel formula injection (CWE-1236).

    Spreadsheet apps treat a cell as a formula if its first character is one of
    =, +, -, @ (or a leading tab/CR in some parsers). Any text that reaches a
    CSV/XLSX export — product names, notes, raw values from an uploaded import
    file — may originate from an untrusted user, so prefix a bare quote to
    force spreadsheet apps to treat it as literal text instead of executing it.
    """
    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_TRIGGER_CHARS):
        return "'" + text
    return text
