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
from app.modules.admin_subscriptions import service
from app.modules.admin_subscriptions.service import AdminSubscriptionError
from app.schemas.admin_subscriptions import SubscriptionDetail, SubscriptionListItem, SubscriptionUpdateRequest

router = APIRouter(prefix="/api/admin", tags=["admin-subscriptions"])


@router.get("/subscriptions")
def list_subscriptions(
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    rows = service.list_subscriptions(db)
    items = [SubscriptionListItem.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Subscriptions loaded", items)


@router.get("/customers/{tenant_id}/subscription")
def get_subscription(
    tenant_id: str,
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    try:
        detail = service.get_subscription(db, tenant_id)
    except AdminSubscriptionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return make_response(True, "Subscription loaded", SubscriptionDetail.model_validate(detail).model_dump(mode="json"))


@router.put("/customers/{tenant_id}/subscription")
def update_subscription(
    tenant_id: str,
    payload: SubscriptionUpdateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role("super_admin", "operations", "finance")),
) -> dict[str, Any]:
    changed_by = f"{current_admin.first_name} {current_admin.last_name}"
    try:
        detail = service.update_subscription(
            db,
            tenant_id,
            changed_by=changed_by,
            plan=payload.plan,
            subscription_status=payload.subscription_status,
            trial_ends_at=payload.trial_ends_at,
            clear_trial=payload.clear_trial,
            note=payload.note,
        )
    except AdminSubscriptionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    admin_db.add(
        AdminAuditLog(
            admin_user_id=current_admin.id,
            admin_user_name=changed_by,
            action="tenant.subscription_updated",
            target_type="tenant",
            target_id=tenant_id,
            details={
                "plan": payload.plan,
                "subscription_status": payload.subscription_status,
                "note": payload.note,
            },
        )
    )
    admin_db.commit()
    return make_response(True, "Subscription updated", SubscriptionDetail.model_validate(detail).model_dump(mode="json"))
