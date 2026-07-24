from __future__ import annotations

import pytest

from app.core.sanitize import escape_formula


@pytest.mark.parametrize("payload", ["=cmd|'/c calc'!A1", "+1+1", "-2+3", "@SUM(A1:A2)", "\tHIDDEN"])
def test_escape_formula_prefixes_dangerous_leading_characters(payload: str) -> None:
    result = escape_formula(payload)
    assert result.startswith("'")
    assert result[1:] == payload


def test_escape_formula_leaves_normal_text_untouched() -> None:
    assert escape_formula("Widget A") == "Widget A"
    assert escape_formula("some notes here") == "some notes here"


def test_escape_formula_handles_none_and_non_strings() -> None:
    assert escape_formula(None) == ""
    assert escape_formula(42) == "42"
    assert escape_formula(-5) == "'-5"
