from __future__ import annotations

import io
from pathlib import Path

from reportlab.lib.units import mm
from reportlab.platypus import Image

LOGO_MAX_WIDTH = 40 * mm
LOGO_MAX_HEIGHT = 20 * mm


def logo_flowable(logo_url: str, max_width: float = LOGO_MAX_WIDTH, max_height: float = LOGO_MAX_HEIGHT) -> Image | None:
    """Resolve a logo URL (local `/uploads/...` path or a remote Blob URL) and size it to fit.

    Best-effort: any missing file, unreadable image, or unsupported format (e.g. SVG, which
    reportlab can't rasterize without an extra dependency) silently skips the logo rather than
    breaking PDF generation for the whole tenant.
    """
    try:
        from PIL import Image as PILImage

        clean_url = logo_url.split("?", 1)[0]
        if clean_url.startswith("http://") or clean_url.startswith("https://"):
            import httpx

            response = httpx.get(clean_url, timeout=10.0)
            response.raise_for_status()
            source: str | io.BytesIO = io.BytesIO(response.content)
        else:
            local_path = Path(clean_url.lstrip("/"))
            if not local_path.is_file():
                return None
            source = str(local_path)

        with PILImage.open(source) as img:
            img.load()
            width_px, height_px = img.size
        if isinstance(source, io.BytesIO):
            source.seek(0)
        aspect = height_px / width_px if width_px else 1
        width = max_width
        height = width * aspect
        if height > max_height:
            height = max_height
            width = height / aspect
        return Image(source, width=width, height=height)
    except Exception:
        return None
