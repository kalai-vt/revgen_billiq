from __future__ import annotations

from typing import Any


def make_response(success: bool, message: str, data: Any = None, errors: list[str] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"success": success, "message": message}
    if data is not None:
        payload["data"] = data
    if not success:
        payload["errors"] = errors or []
    return payload
