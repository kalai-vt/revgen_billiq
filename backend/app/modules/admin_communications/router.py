from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import require_admin_role
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.models_admin.audit_log import AdminAuditLog
from app.modules.admin_communications import service
from app.modules.admin_communications.service import AdminCommunicationError
from app.schemas.admin_communications import BroadcastRequest, CommunicationOut

router = APIRouter(prefix="/api/admin/communications", tags=["admin-communications"])


@router.get("")
def list_communications(
    admin_db: Session = Depends(get_admin_db),
    _current_admin: AdminUser = Depends(require_admin_role("super_admin", "operations", "sales", "support")),
) -> dict[str, Any]:
    rows = service.list_communications(admin_db)
    items = [CommunicationOut.model_validate(row, from_attributes=True).model_dump(mode="json") for row in rows]
    return make_response(True, "Communications loaded", items)


@router.post("/broadcast")
def send_broadcast(
    payload: BroadcastRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin", "operations", "sales")),
) -> dict[str, Any]:
    admin_name = f"{current_admin.first_name} {current_admin.last_name}"
    try:
        result = service.send_broadcast(
            db,
            admin_db,
            admin_id=current_admin.id,
            admin_name=admin_name,
            subject=payload.subject,
            message=payload.message,
            audience_type=payload.audience_type,
            plan=payload.plan,
            tenant_id=payload.tenant_id,
        )
    except AdminCommunicationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    admin_db.add(
        AdminAuditLog(
            admin_user_id=current_admin.id,
            admin_user_name=admin_name,
            action="communication.broadcast_sent",
            target_type="communication",
            target_id=result["id"],
            details={"audience_type": payload.audience_type, "recipient_count": result["recipient_count"]},
        )
    )
    admin_db.commit()
    return make_response(True, "Broadcast sent", CommunicationOut.model_validate(result).model_dump(mode="json"))
