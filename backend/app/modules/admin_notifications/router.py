from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.modules.admin_notifications import service
from app.schemas.admin_notifications import NotificationOut

router = APIRouter(prefix="/api/admin/notifications", tags=["admin-notifications"])


@router.get("")
def list_notifications(
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    service.generate_system_notifications(db, admin_db)
    rows = service.list_notifications(admin_db, current_admin.id)
    items = [NotificationOut.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Notifications loaded", items)


@router.get("/unread-count")
def get_unread_count(
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    count = service.unread_count(admin_db, current_admin.id)
    return make_response(True, "Unread count loaded", {"count": count})


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: str,
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    service.mark_read(admin_db, notification_id, current_admin.id)
    return make_response(True, "Marked as read")


@router.post("/read-all")
def mark_all_read(
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    service.mark_all_read(admin_db, current_admin.id)
    return make_response(True, "All notifications marked as read")
