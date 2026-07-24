from __future__ import annotations

import csv
import io

from app.modules.inventory.parsers.base import ImportedRow, ParserError


class CsvParser:
    async def parse(self, file_bytes: bytes, filename: str) -> list[ImportedRow]:
        try:
            text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ParserError(f"Could not decode CSV file: {exc}") from exc

        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ParserError("The uploaded file has no header row")

        rows: list[ImportedRow] = []
        for raw_row in reader:
            values = {key.strip(): (value or "").strip() for key, value in raw_row.items() if key}
            if not any(values.values()):
                continue
            rows.append(ImportedRow(raw=values))
        return rows
