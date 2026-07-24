from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.activity import service

router = APIRouter(prefix="/api", tags=["activity"])


@router.get("/activity-log")
def get_activity_log(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    module: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: User = Depends(require_role("owner", "manager")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total = service.list_activity_log(
        db, current_user.tenant_id, page=page, page_size=page_size, module=module, date_from=date_from, date_to=date_to
    )
    return make_response(
        True,
        "Activity log loaded",
        {
            "items": [item.model_dump(mode="json") for item in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    )
