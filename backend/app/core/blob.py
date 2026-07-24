from __future__ import annotations

import os
from pathlib import Path

import httpx

_BLOB_API_URL = "https://vercel.com/api/blob"
_BLOB_API_VERSION = "12"


def _token() -> str | None:
    return os.environ.get("BLOB_READ_WRITE_TOKEN")


def upload_file(pathname: str, content: bytes, content_type: str) -> str:
    """Store a file and return its public URL.

    Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is configured (production);
    otherwise falls back to local disk under uploads/, for local development
    where no Blob store is provisioned.
    """
    token = _token()
    if not token:
        dest = Path("uploads") / pathname
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
