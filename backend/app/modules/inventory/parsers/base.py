from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class ImportedRow:
    """One raw row extracted from a source file, keyed by its original header text.

    `confidence` is always `None` for today's deterministic Excel/CSV parsers.
    It exists so a future OCR/AI parser can flag low-confidence field
    extractions per row without any change to column mapping, validation, or
    the preview grid — a low-confidence field is exactly what the existing
    "Warning" row status is for.
    """

    raw: dict[str, str]
    confidence: dict[str, float] | None = None


class ParserError(Exception):
    """File-level failure (corrupt file, unreadable format, total extraction failure) —
    distinct from a per-row validation error."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ImportParser(Protocol):
    async def parse(self, file_bytes: bytes, filename: str) -> list[ImportedRow]: ...
