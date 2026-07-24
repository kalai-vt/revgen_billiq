from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_role
from app.core.responses import make_response
from app.models.user import User
from app.modules.notifications import service
from app.modules.notifications.service import NotificationError
from app.schemas.notification import NotificationOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def get_notifications(
    unread_only: bool = False,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items, total, unread_count = service.list_notifications(db, current_user.tenant_id, unread_only=unread_only)
    return make_response(
        True,
        "Notifications loaded",
        {
            "items": [NotificationOut.model_validate(i).model_dump(mode="json") for i in items],
            "total": total,
            "unread_count": unread_count,
        },
    )


@router.post("/{notification_id}/read")
def post_mark_read(
    notification_id: str,
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        notification = service.mark_read(db, current_user.tenant_id, notification_id)
    except NotificationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Notification marked as read", NotificationOut.model_validate(notification).model_dump(mode="json"))


@router.post("/read-all")
def post_mark_all_read(
    current_user: User = Depends(require_role("owner", "manager", "staff")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    service.mark_all_read(db, current_user.tenant_id)
    return make_response(True, "All notifications marked as read", {})
