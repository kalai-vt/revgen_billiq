from __future__ import annotations

import hmac
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.responses import make_response
from app.modules.internal_cron.service import run_subscription_check

router = APIRouter(prefix="/api/internal/cron", tags=["internal-cron"])


def _verify_cron_request(request: Request) -> None:
    # Vercel Cron Jobs always send a GET request and, when a project env var literally named
    # `CRON_SECRET` (unprefixed — not REVGENIQ_-prefixed like everything else in this app) is
    # set, automatically attach it as `Authorization: Bearer <value>`. Reading it straight from
    # the environment rather than through app.core.config.Settings is deliberate: this is the
    # one value that must match Vercel's own naming convention exactly for the auto-injection to
    # work, not this app's usual REVGENIQ_ prefix. No CRON_SECRET configured means this endpoint
    # always rejects — a safer default than an unauthenticated internal endpoint.
    cron_secret = os.environ.get("CRON_SECRET")
    auth_header = request.headers.get("authorization") or ""
    presented = auth_header.removeprefix("Bearer ").strip()
    if not cron_secret or not presented or not hmac.compare_digest(presented, cron_secret):
        raise HTTPException(status_code=401, detail="Invalid or missing cron secret")


@router.get("/subscription-check")
def get_subscription_check(_: None = Depends(_verify_cron_request), db: Session = Depends(get_db)) -> dict[str, Any]:
    results = run_subscription_check(db)
    return make_response(True, "Subscription check complete", results)
