from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user, require_admin_role
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.models_admin.audit_log import AdminAuditLog
from app.modules.admin_trial_reminders import service
from app.modules.admin_trial_reminders.service import TrialReminderError
from app.schemas.admin_trial_reminders import ReminderLogOut, ReminderResult, SendReminderRequest

router = APIRouter(prefix="/api/admin/customers/{tenant_id}/trial-reminders", tags=["admin-trial-reminders"])


@router.get("")
def get_reminder_history(
    tenant_id: str,
    admin_db: Session = Depends(get_admin_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    rows = service.list_reminder_history(admin_db, tenant_id)
    items = [ReminderLogOut.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Reminder history loaded", items)


@router.post("")
def send_reminder(
    tenant_id: str,
    payload: SendReminderRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin", "operations", "finance", "support")),
) -> dict[str, Any]:
    admin_name = f"{current_admin.first_name} {current_admin.last_name}"
    try:
        results = service.send_trial_reminder(
            db,
            admin_db,
            tenant_id,
            channels=payload.channels,
            admin_id=current_admin.id,
            admin_name=admin_name,
        )
    except TrialReminderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    admin_db.add(
        AdminAuditLog(
            admin_user_id=current_admin.id,
            admin_user_name=admin_name,
            action="tenant.trial_reminder_sent",
            target_type="tenant",
            target_id=tenant_id,
            details={"channels": payload.channels, "results": results},
        )
    )
    admin_db.commit()
    out = [ReminderResult.model_validate(r).model_dump(mode="json") for r in results]
    return make_response(True, "Reminder sent", out)
