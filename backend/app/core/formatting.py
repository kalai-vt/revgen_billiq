from __future__ import annotations

from datetime import datetime

_DATE_FORMAT_PATTERNS = {
    "DD/MM/YYYY": "%d/%m/%Y",
    "MM/DD/YYYY": "%m/%d/%Y",
    "YYYY-MM-DD": "%Y-%m-%d",
}


def format_date(value: datetime, date_format: str) -> str:
    pattern = _DATE_FORMAT_PATTERNS.get(date_format, _DATE_FORMAT_PATTERNS["DD/MM/YYYY"])
    return value.strftime(f"{pattern} %H:%M")


def format_amount(value: float, decimal_precision: int) -> str:
    return f"{value:.{decimal_precision}f}"
