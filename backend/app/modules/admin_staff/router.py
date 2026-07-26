from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user, require_admin_role
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.models_admin.audit_log import AdminAuditLog
from app.modules.admin_staff import service
from app.modules.admin_staff.service import AdminStaffError
from app.schemas.admin_staff import AdminStaffInviteRequest, AdminStaffOut, AdminStaffRoleUpdateRequest

router = APIRouter(prefix="/api/admin/staff", tags=["admin-staff"])


def _log(admin_db: Session, current_admin: AdminUser, action: str, target_id: str, details: dict | None = None) -> None:
    admin_db.add(
        AdminAuditLog(
            admin_user_id=current_admin.id,
            admin_user_name=f"{current_admin.first_name} {current_admin.last_name}",
            action=action,
            target_type="admin_user",
            target_id=target_id,
            details=details,
        )
    )
    admin_db.commit()


@router.get("")
def list_staff(
    admin_db: Session = Depends(get_admin_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    rows = service.list_staff(admin_db)
    items = [AdminStaffOut.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Staff loaded", items)


@router.post("/invite")
def invite_staff(
    payload: AdminStaffInviteRequest,
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin")),
) -> dict[str, Any]:
    try:
        admin = service.invite_staff(
            admin_db,
            inviting_admin=current_admin,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            role=payload.role,
        )
    except AdminStaffError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log(admin_db, current_admin, "staff.invited", admin.id, {"email": admin.email, "role": admin.role})
    return make_response(True, "Invite sent", AdminStaffOut.model_validate(admin).model_dump(mode="json"))


@router.put("/{admin_user_id}/role")
def update_role(
    admin_user_id: str,
    payload: AdminStaffRoleUpdateRequest,
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin")),
) -> dict[str, Any]:
    try:
        admin = service.update_role(admin_db, admin_user_id, payload.role)
    except AdminStaffError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log(admin_db, current_admin, "staff.role_updated", admin_user_id, {"role": payload.role})
    return make_response(True, "Role updated", AdminStaffOut.model_validate(admin).model_dump(mode="json"))


@router.post("/{admin_user_id}/deactivate")
def deactivate_staff(
    admin_user_id: str,
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin")),
) -> dict[str, Any]:
    if admin_user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    try:
        admin = service.set_active_status(admin_db, admin_user_id, False)
    except AdminStaffError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log(admin_db, current_admin, "staff.deactivated", admin_user_id)
    return make_response(True, "Staff account deactivated", AdminStaffOut.model_validate(admin).model_dump(mode="json"))


@router.post("/{admin_user_id}/activate")
def activate_staff(
    admin_user_id: str,
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin")),
) -> dict[str, Any]:
    try:
        admin = service.set_active_status(admin_db, admin_user_id, True)
    except AdminStaffError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log(admin_db, current_admin, "staff.activated", admin_user_id)
    return make_response(True, "Staff account activated", AdminStaffOut.model_validate(admin).model_dump(mode="json"))
