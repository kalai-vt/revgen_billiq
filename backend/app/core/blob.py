from __future__ import annotations

import os
from pathlib import Path

import httpx

_BLOB_API_URL = "https://vercel.com/api/blob"
_BLOB_API_VERSION = "12"

_UPLOADS_ROOT = Path("uploads").resolve()


class UploadValidationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


def _token() -> str | None:
    return os.environ.get("BLOB_READ_WRITE_TOKEN")


def upload_file(
    pathname: str,
    content: bytes,
    content_type: str,
    *,
    allowed_content_types: dict[str, str] | None = None,
    max_size_bytes: int | None = None,
) -> str:
    """Store a file and return its public URL.

    Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is configured (production);
    otherwise falls back to local disk under uploads/, for local development
    where no Blob store is provisioned.

    Content-type/size validation lives here rather than at each call site — every previous caller
    validated independently, which meant safety depended on every future call site remembering to
    do the same. Pass `allowed_content_types`/`max_size_bytes` to enforce them; omit either to skip
    that check (e.g. for trusted, already-generated internal files, if that's ever needed).
    """
    if allowed_content_types is not None and content_type not in allowed_content_types:
        allowed = ", ".join(sorted(allowed_content_types))
        raise UploadValidationError(f"Unsupported file type. Allowed: {allowed}")
    if max_size_bytes is not None and len(content) > max_size_bytes:
        raise UploadValidationError(f"File must be smaller than {max_size_bytes // (1024 * 1024)}MB")

    token = _token()
    if not token:
        dest = (Path("uploads") / pathname).resolve()
        if dest != _UPLOADS_ROOT and _UPLOADS_ROOT not in dest.parents:
            # Defense in depth: today's callers only ever build `pathname` from server-generated
            # IDs plus a whitelisted extension, never from raw user input, so this shouldn't be
            # reachable in practice — but a future call site passing something path-traversal-ish
            # (`../../`) should fail loudly here rather than write outside uploads/.
            raise UploadValidationError("Invalid file path")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        return f"/uploads/{pathname}"

    response = httpx.put(
        f"{_BLOB_API_URL}/",
        params={"pathname": pathname},
        content=content,
        headers={
            "authorization": f"Bearer {token}",
            "x-api-version": _BLOB_API_VERSION,
            "x-content-type": content_type,
            "x-vercel-blob-access": "public",
            "x-add-random-suffix": "0",
            "x-allow-overwrite": "1",
        },
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()["url"]
