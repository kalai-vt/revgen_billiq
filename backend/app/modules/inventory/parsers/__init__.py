from __future__ import annotations

from app.modules.inventory.parsers.base import ImportedRow, ImportParser, ParserError
from app.modules.inventory.parsers.csv_parser import CsvParser
from app.modules.inventory.parsers.excel_parser import ExcelParser

_PARSERS: dict[str, ImportParser] = {
    "xlsx": ExcelParser(),
    "xls": ExcelParser(),
    "csv": CsvParser(),
}

_SOURCE_TYPES: dict[str, str] = {"xlsx": "excel", "xls": "excel", "csv": "csv"}


def get_parser(filename: str) -> tuple[ImportParser, str]:
    """Dispatch to a parser by file extension.

    This is the only place that knows about file extensions — everything
    downstream of `parser.parse(...)` works with the same `ImportedRow` shape
    regardless of source, so adding a future PDF/OCR/image/AI parser is just
    another entry in `_PARSERS` plus a new class implementing `ImportParser`.
    """
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    parser = _PARSERS.get(extension)
    if parser is None:
        raise ParserError(f"Unsupported file type '.{extension}'. Upload a .xlsx or .csv file.")
    return parser, _SOURCE_TYPES[extension]


__all__ = ["ImportParser", "ImportedRow", "ParserError", "get_parser"]
