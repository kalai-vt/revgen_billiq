from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user, require_admin_role
from app.core.db import get_db
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.models_admin.audit_log import AdminAuditLog
from app.modules.admin_customers import service
from app.modules.admin_customers.service import AdminCustomerError
from app.schemas.admin_customers import AdminCustomerListItem, AdminCustomerProfile

router = APIRouter(prefix="/api/admin/customers", tags=["admin-customers"])


def _log_action(
    admin_db: Session,
    current_admin: AdminUser,
    action: str,
    target_id: str,
    details: dict[str, Any] | None = None,
) -> None:
    admin_db.add(
        AdminAuditLog(
            admin_user_id=current_admin.id,
            admin_user_name=f"{current_admin.first_name} {current_admin.last_name}",
            action=action,
            target_type="tenant",
            target_id=target_id,
            details=details,
        )
    )
    admin_db.commit()


@router.get("")
def list_customers(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    rows = service.list_customers(db, search=search, status=status)
    items = [AdminCustomerListItem.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Customers loaded", items)


@router.get("/{tenant_id}")
def get_customer(
    tenant_id: str,
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    try:
        profile = service.get_customer_profile(db, tenant_id)
    except AdminCustomerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Customer loaded", AdminCustomerProfile.model_validate(profile).model_dump(mode="json"))


@router.post("/{tenant_id}/suspend")
def suspend_customer(
    tenant_id: str,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin", "operations")),
) -> dict[str, Any]:
    try:
        service.set_tenant_status(db, tenant_id, "suspended")
    except AdminCustomerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log_action(admin_db, current_admin, "tenant.suspend", tenant_id)
    return make_response(True, "Customer suspended")


@router.post("/{tenant_id}/activate")
def activate_customer(
    tenant_id: str,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin", "operations")),
) -> dict[str, Any]:
    try:
        service.set_tenant_status(db, tenant_id, "active")
    except AdminCustomerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log_action(admin_db, current_admin, "tenant.activate", tenant_id)
    return make_response(True, "Customer activated")


@router.post("/{tenant_id}/reset-password")
def reset_customer_password(
    tenant_id: str,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(
        require_admin_role("super_admin", "operations", "support")
    ),
) -> dict[str, Any]:
    try:
        email = service.trigger_owner_password_reset(db, tenant_id)
    except AdminCustomerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    _log_action(admin_db, current_admin, "tenant.reset_password", tenant_id, {"email": email})
    return make_response(True, "Password reset email sent")
