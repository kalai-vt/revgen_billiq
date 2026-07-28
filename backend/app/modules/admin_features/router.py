from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.admin_db import get_admin_db
from app.core.admin_deps import get_current_admin_user, require_admin_role
from app.core.db import get_db
from app.core.feature_catalog import CATEGORY_LABELS, FEATURE_CATALOG
from app.core.responses import make_response
from app.models_admin.admin_user import AdminUser
from app.models_admin.audit_log import AdminAuditLog
from app.modules.admin_features import service
from app.modules.admin_features.service import AdminFeatureError
from app.schemas.admin_features import (
    BulkFeatureUpdateRequest,
    CustomerFeaturePanelItem,
    FeatureAnalyticsResponse,
    FeatureHistoryItem,
    FeatureImpactResponse,
    FeatureResetRequest,
    FeatureScheduleCreateRequest,
    FeatureScheduleItem,
    FeatureSummaryResponse,
    FeatureTemplateCreateRequest,
    FeatureTemplateItem,
    FeatureUpdateRequest,
    ScopedBulkUpdateRequest,
    TemplateAssignRequest,
    TenantFeatureItem,
    TenantFeatureSummary,
)

router = APIRouter(tags=["admin-features"])

WRITE_ROLES = ("super_admin", "operations")


def _log(admin_db: Session, current_admin: AdminUser, action: str, target_id: str, details: dict[str, Any] | None = None) -> None:
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


def _raise(exc: AdminFeatureError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


# ---------------------------------------------------------------------------
# Catalog (static, no tenant)
# ---------------------------------------------------------------------------


@router.get("/api/admin/features/catalog")
def get_catalog(_current_admin: AdminUser = Depends(get_current_admin_user)) -> dict[str, Any]:
    return make_response(
        True,
        "Feature catalog loaded",
        {"categories": CATEGORY_LABELS, "modules": FEATURE_CATALOG},
    )


# ---------------------------------------------------------------------------
# Per-tenant feature list / update / impact
# ---------------------------------------------------------------------------


@router.get("/api/admin/customers/{tenant_id}/features")
def get_features(
    tenant_id: str, db: Session = Depends(get_db), _current_admin: AdminUser = Depends(get_current_admin_user)
) -> dict[str, Any]:
    try:
        rows = service.list_tenant_features(db, tenant_id)
    except AdminFeatureError as exc:
        _raise(exc)
    items = [TenantFeatureItem.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Feature flags loaded", items)


@router.get("/api/admin/customers/{tenant_id}/features/{module_key}/impact")
def get_impact(
    tenant_id: str,
    module_key: str,
    target_status: str = Query(...),
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    try:
        impact = service.get_feature_impact(db, tenant_id, module_key, target_status)
    except AdminFeatureError as exc:
        _raise(exc)
    return make_response(True, "Impact calculated", FeatureImpactResponse.model_validate(impact).model_dump(mode="json"))


@router.put("/api/admin/customers/{tenant_id}/features/{module_key}")
def update_feature(
    tenant_id: str,
    module_key: str,
    payload: FeatureUpdateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    try:
        item = service.update_tenant_feature(
            db,
            tenant_id,
            module_key,
            current_admin,
            status=payload.status,
            hidden_from_nav=payload.hidden_from_nav,
            access_level=payload.access_level,
            config=payload.config,
            reason=payload.reason,
            force=payload.force,
        )
    except AdminFeatureError as exc:
        _raise(exc)
    _log(admin_db, current_admin, "tenant.feature_updated", tenant_id, {"module_key": module_key, **payload.model_dump()})
    return make_response(True, "Feature updated — takes effect immediately", TenantFeatureItem.model_validate(item).model_dump(mode="json"))


@router.post("/api/admin/customers/{tenant_id}/features/reset")
def reset_features(
    tenant_id: str,
    payload: FeatureResetRequest | None = None,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    module_keys = payload.module_keys if payload else None
    try:
        service.reset_to_plan_defaults(db, tenant_id, current_admin, module_keys=module_keys)
    except AdminFeatureError as exc:
        _raise(exc)
    _log(admin_db, current_admin, "tenant.features_reset", tenant_id, {"module_keys": module_keys})
    return make_response(True, "Reset to plan defaults")


@router.get("/api/admin/customers/{tenant_id}/features/summary")
def get_tenant_feature_summary(
    tenant_id: str, db: Session = Depends(get_db), _current_admin: AdminUser = Depends(get_current_admin_user)
) -> dict[str, Any]:
    try:
        data = service.get_tenant_feature_summary(db, tenant_id)
    except AdminFeatureError as exc:
        _raise(exc)
    return make_response(True, "Summary loaded", TenantFeatureSummary.model_validate(data).model_dump(mode="json"))


@router.post("/api/admin/customers/{tenant_id}/features/bulk-update")
def bulk_update_tenant_modules(
    tenant_id: str,
    payload: ScopedBulkUpdateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    try:
        result = service.bulk_update_tenant_modules(
            db, tenant_id, payload.module_keys, payload.status, current_admin, payload.reason, payload.force
        )
    except AdminFeatureError as exc:
        _raise(exc)
    _log(admin_db, current_admin, "tenant.features_bulk_updated", tenant_id, {"status": payload.status, **result})
    return make_response(True, f"Updated {len(result['updated'])} of {len(payload.module_keys)} modules", result)


# ---------------------------------------------------------------------------
# Bulk updates
# ---------------------------------------------------------------------------


@router.post("/api/admin/features/bulk-update")
def bulk_update(
    payload: BulkFeatureUpdateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    result = service.bulk_update_feature(db, payload.tenant_ids, payload.module_key, payload.status, current_admin, payload.reason)
    _log(admin_db, current_admin, "tenant.feature_bulk_updated", "bulk", {"module_key": payload.module_key, "status": payload.status, **result})
    return make_response(True, f"Updated {len(result['updated'])} of {len(payload.tenant_ids)} customers", result)


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


@router.get("/api/admin/features/templates")
def list_templates(
    admin_db: Session = Depends(get_admin_db), _current_admin: AdminUser = Depends(get_current_admin_user)
) -> dict[str, Any]:
    rows = service.list_templates(admin_db)
    items = [FeatureTemplateItem.model_validate(row, from_attributes=True).model_dump(mode="json") for row in rows]
    return make_response(True, "Templates loaded", items)


@router.post("/api/admin/features/templates")
def create_template(
    payload: FeatureTemplateCreateRequest,
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    row = service.create_template(
        admin_db, payload.name, payload.description, [m.model_dump() for m in payload.modules], current_admin
    )
    _log(admin_db, current_admin, "feature_template.created", row.id, {"name": payload.name})
    return make_response(True, "Template created", FeatureTemplateItem.model_validate(row, from_attributes=True).model_dump(mode="json"))


@router.delete("/api/admin/features/templates/{template_id}")
def delete_template(
    template_id: str,
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    try:
        service.delete_template(admin_db, template_id)
    except AdminFeatureError as exc:
        _raise(exc)
    _log(admin_db, current_admin, "feature_template.deleted", template_id)
    return make_response(True, "Template deleted")


@router.post("/api/admin/features/templates/{template_id}/assign")
def assign_template(
    template_id: str,
    payload: TemplateAssignRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    try:
        result = service.assign_template_to_tenants(db, admin_db, template_id, payload.tenant_ids, current_admin, payload.reason)
    except AdminFeatureError as exc:
        _raise(exc)
    _log(admin_db, current_admin, "feature_template.assigned", template_id, result)
    return make_response(True, f"Applied to {len(result['updated'])} of {len(payload.tenant_ids)} customers", result)


# ---------------------------------------------------------------------------
# History / rollback
# ---------------------------------------------------------------------------


@router.get("/api/admin/customers/{tenant_id}/features/history")
def get_history(
    tenant_id: str,
    module_key: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    rows = service.list_history(db, tenant_id, module_key)
    items = [FeatureHistoryItem.model_validate(row, from_attributes=True).model_dump(mode="json") for row in rows]
    return make_response(True, "History loaded", items)


@router.post("/api/admin/customers/{tenant_id}/features/history/{history_id}/rollback")
def rollback(
    tenant_id: str,
    history_id: str,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    try:
        item = service.rollback_history(db, tenant_id, history_id, current_admin)
    except AdminFeatureError as exc:
        _raise(exc)
    _log(admin_db, current_admin, "tenant.feature_rolled_back", tenant_id, {"history_id": history_id})
    return make_response(True, "Rolled back", TenantFeatureItem.model_validate(item).model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------


@router.get("/api/admin/customers/{tenant_id}/features/schedules")
def get_schedules(
    tenant_id: str, db: Session = Depends(get_db), _current_admin: AdminUser = Depends(get_current_admin_user)
) -> dict[str, Any]:
    rows = service.list_schedules(db, tenant_id)
    items = [FeatureScheduleItem.model_validate(row, from_attributes=True).model_dump(mode="json") for row in rows]
    return make_response(True, "Schedules loaded", items)


@router.post("/api/admin/customers/{tenant_id}/features/schedules")
def create_schedule(
    tenant_id: str,
    payload: FeatureScheduleCreateRequest,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    try:
        row = service.create_schedule(db, tenant_id, payload.module_key, payload.action, payload.scheduled_for, current_admin)
    except AdminFeatureError as exc:
        _raise(exc)
    _log(admin_db, current_admin, "tenant.feature_scheduled", tenant_id, {"module_key": payload.module_key, "action": payload.action})
    return make_response(True, "Scheduled", FeatureScheduleItem.model_validate(row, from_attributes=True).model_dump(mode="json"))


@router.delete("/api/admin/customers/{tenant_id}/features/schedules/{schedule_id}")
def cancel_schedule(
    tenant_id: str,
    schedule_id: str,
    db: Session = Depends(get_db),
    admin_db: Session = Depends(get_admin_db),
    current_admin: AdminUser = Depends(require_admin_role(*WRITE_ROLES)),
) -> dict[str, Any]:
    try:
        service.cancel_schedule(db, tenant_id, schedule_id)
    except AdminFeatureError as exc:
        _raise(exc)
    _log(admin_db, current_admin, "tenant.feature_schedule_cancelled", tenant_id, {"schedule_id": schedule_id})
    return make_response(True, "Schedule cancelled")


# ---------------------------------------------------------------------------
# Summary cards / customer list / analytics
# ---------------------------------------------------------------------------


@router.get("/api/admin/features/summary")
def get_summary(db: Session = Depends(get_db), _current_admin: AdminUser = Depends(get_current_admin_user)) -> dict[str, Any]:
    data = service.get_summary(db)
    return make_response(True, "Summary loaded", FeatureSummaryResponse.model_validate(data).model_dump(mode="json"))


@router.get("/api/admin/features/customers")
def list_feature_customers(
    search: str | None = Query(default=None),
    industry: str | None = Query(default=None),
    plan: str | None = Query(default=None),
    status: str | None = Query(default=None),
    subscription_status: str | None = Query(default=None),
    is_trial: bool | None = Query(default=None),
    country: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(get_current_admin_user),
) -> dict[str, Any]:
    rows = service.list_customers_for_panel(
        db, search=search, industry=industry, plan=plan, status=status,
        subscription_status=subscription_status, is_trial=is_trial, country=country,
    )
    items = [CustomerFeaturePanelItem.model_validate(row).model_dump(mode="json") for row in rows]
    return make_response(True, "Customers loaded", items)


@router.get("/api/admin/features/analytics")
def get_analytics(db: Session = Depends(get_db), _current_admin: AdminUser = Depends(get_current_admin_user)) -> dict[str, Any]:
    data = service.get_analytics(db)
    return make_response(True, "Analytics loaded", FeatureAnalyticsResponse.model_validate(data).model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Developer debug — raw flag + catalog dump for a single tenant
# ---------------------------------------------------------------------------


@router.get("/api/admin/customers/{tenant_id}/features/debug")
def debug_features(
    tenant_id: str,
    db: Session = Depends(get_db),
    _current_admin: AdminUser = Depends(require_admin_role("super_admin", "developer")),
) -> dict[str, Any]:
    try:
        rows = service.list_tenant_features(db, tenant_id)
    except AdminFeatureError as exc:
        _raise(exc)
    return make_response(True, "Debug snapshot", rows)
