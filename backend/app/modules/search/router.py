from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.search import service

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def get_global_search(
    q: str = Query(min_length=1),
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    result = service.global_search(db, current_user.tenant_id, q)
    return make_response(True, "Search results", result.model_dump(mode="json"))
