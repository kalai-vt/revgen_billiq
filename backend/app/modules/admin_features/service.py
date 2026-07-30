from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.feature_catalog import (
    CATEGORY_LABELS,
    FEATURE_BY_KEY,
    FEATURE_CATALOG,
    PLAN_DISPLAY_NAMES,
    get_dependents,
    get_plan_defaults,
    topo_order,
    version_gte,
)
from app.models.feature_flag import FeatureSchedule, TenantFeatureFlag, TenantFeatureFlagHistory
from app.models.notification import Notification
from app.models.settings import Settings
from app.models.tenant import Tenant
from app.models.user import User
from app.models_admin.admin_user import AdminUser
from app.models_admin.feature_template import FeatureTemplate


class AdminFeatureError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_tenant(db: Session, tenant_id: str) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.is_deleted:
        raise AdminFeatureError(404, "Customer not found")
    return tenant


def _get_settings(db: Session, tenant_id: str) -> Settings | None:
    return db.query(Settings).filter(Settings.tenant_id == tenant_id).first()


def _flags_map(db: Session, tenant_id: str) -> dict[str, TenantFeatureFlag]:
    rows = db.query(TenantFeatureFlag).filter(TenantFeatureFlag.tenant_id == tenant_id).all()
    return {row.module_key: row for row in rows}


def _admin_name(admin: AdminUser) -> str:
    return f"{admin.first_name} {admin.last_name}"


# ---------------------------------------------------------------------------
# Scheduling — applied lazily on read/write since there's no persistent worker
# process here; the next time anyone looks at a tenant's flags, due schedules fire.
# ---------------------------------------------------------------------------


def apply_due_schedules(db: Session, tenant_id: str | None = None) -> None:
    query = db.query(FeatureSchedule).filter(
        FeatureSchedule.status == "pending", FeatureSchedule.scheduled_for <= _now()
    )
    if tenant_id:
        query = query.filter(FeatureSchedule.tenant_id == tenant_id)
    due = query.all()
    for schedule in due:
        flag = _get_or_create_flag(db, schedule.tenant_id, schedule.module_key)
        previous_state = _flag_state(flag)
        flag.status = schedule.action
        flag.updated_by_admin_id = schedule.created_by_admin_id
        flag.updated_by_admin_name = schedule.created_by_admin_name
        flag.reason = "Scheduled change applied"
        db.add(flag)
        db.add(
            TenantFeatureFlagHistory(
                tenant_id=schedule.tenant_id,
                module_key=schedule.module_key,
                action=schedule.action,
                previous_state=previous_state,
                new_state=_flag_state(flag),
                changed_by_admin_id=schedule.created_by_admin_id,
                changed_by_admin_name=schedule.created_by_admin_name,
                reason="Scheduled change applied",
            )
        )
        _notify_tenant(db, schedule.tenant_id, schedule.module_key, schedule.action)
        schedule.status = "applied"
        schedule.applied_at = _now()
        db.add(schedule)
    if due:
        db.commit()


# ---------------------------------------------------------------------------
# Catalog <-> flag merge
# ---------------------------------------------------------------------------


def _flag_state(flag: TenantFeatureFlag) -> dict[str, Any]:
    return {
        "status": flag.status,
        "hidden_from_nav": flag.hidden_from_nav,
        "access_level": flag.access_level,
        "config": flag.config,
    }


def _default_status(module: dict[str, Any], defaults: set[str]) -> str:
    return "enabled" if (module["always_on"] or module["key"] in defaults) else "disabled"


def _build_item(module: dict[str, Any], flag: TenantFeatureFlag | None, app_version: str) -> dict[str, Any]:
    if flag:
        status, hidden, access_level, config = flag.status, flag.hidden_from_nav, flag.access_level, flag.config
        updated_at, updated_by, reason, is_custom = flag.updated_at, flag.updated_by_admin_name, flag.reason, True
    else:
        status, hidden, access_level = "enabled" if module["always_on"] else "disabled", False, "full_access"
        config = {f["key"]: f["default"] for f in module["config_schema"]} or None
        updated_at = updated_by = reason = None
        is_custom = False

    return {
        "module_key": module["key"],
        "label": module["label"],
        "description": module["description"],
        "category": module["category"],
        "domain": module["domain"],
        "is_implemented": module["is_implemented"],
        "always_on": module["always_on"],
        "requires": module["requires"],
        "min_version": module["min_version"],
        "version_gated": not version_gte(app_version, module["min_version"]),
        "config_schema": module["config_schema"],
        "status": status,
        "hidden_from_nav": hidden,
        "access_level": access_level,
        "config": config,
        "is_custom": is_custom,
        "updated_at": updated_at,
        "updated_by_admin_name": updated_by,
        "reason": reason,
    }


def list_tenant_features(db: Session, tenant_id: str) -> list[dict[str, Any]]:
    _get_tenant(db, tenant_id)
    apply_due_schedules(db, tenant_id)
    settings = _get_settings(db, tenant_id)
    plan = settings.plan if settings else "basic"
    app_version = settings.app_version if settings else "1.0.0"
    defaults = set(get_plan_defaults(plan))
    flags = _flags_map(db, tenant_id)

    items = []
    for module in FEATURE_CATALOG:
        flag = flags.get(module["key"])
        item = _build_item(module, flag, app_version)
        if not flag:
            item["status"] = _default_status(module, defaults)
        items.append(item)
    return items


def get_tenant_feature(db: Session, tenant_id: str, module_key: str) -> dict[str, Any]:
    if module_key not in FEATURE_BY_KEY:
        raise AdminFeatureError(404, "Unknown module")
    for item in list_tenant_features(db, tenant_id):
        if item["module_key"] == module_key:
            return item
    raise AdminFeatureError(404, "Unknown module")


def _is_enabled(db: Session, tenant_id: str, flags: dict[str, TenantFeatureFlag], defaults: set[str], key: str) -> bool:
    flag = flags.get(key)
    if flag:
        return flag.status == "enabled"
    module = FEATURE_BY_KEY[key]
    return _default_status(module, defaults) == "enabled"


def get_feature_impact(db: Session, tenant_id: str, module_key: str, target_status: str) -> dict[str, Any]:
    if module_key not in FEATURE_BY_KEY:
        raise AdminFeatureError(404, "Unknown module")
    module = FEATURE_BY_KEY[module_key]
    settings = _get_settings(db, tenant_id)
    plan = settings.plan if settings else "basic"
    defaults = set(get_plan_defaults(plan))
    flags = _flags_map(db, tenant_id)

    blocked = False
    block_reason: str | None = None
    affected_dependents: list[str] = []

    if target_status == "enabled":
        missing = [r for r in module["requires"] if not _is_enabled(db, tenant_id, flags, defaults, r)]
        if missing:
            blocked = True
            labels = ", ".join(FEATURE_BY_KEY[m]["label"] for m in missing)
            block_reason = f"{module['label']} requires {labels} to be enabled first."
    else:
        if module["always_on"]:
            blocked = True
            block_reason = f"{module['label']} is a core module and can't be disabled."
        else:
            affected_dependents = [
                d for d in get_dependents(module_key) if _is_enabled(db, tenant_id, flags, defaults, d)
            ]

    data_impact = (
        "No customer data is deleted — existing records stay intact and reappear automatically if the module "
        f"is re-enabled. Customers immediately lose access to the {module['label']} screen and its data entry points."
    )

    return {
        "module_key": module_key,
        "target_status": target_status,
        "affected_dependents": affected_dependents,
        "data_impact": data_impact,
        "blocked": blocked,
        "block_reason": block_reason,
        "requires_confirmation": bool(affected_dependents) and not blocked,
    }


def _notify_tenant(db: Session, tenant_id: str, module_key: str, status: str) -> None:
    module = FEATURE_BY_KEY.get(module_key)
    label = module["label"] if module else module_key
    verb = {"enabled": "enabled", "disabled": "disabled", "suspended": "temporarily suspended"}.get(status, status)
    db.add(
        Notification(
            tenant_id=tenant_id,
            type="feature_update",
            title=f"{label} {verb}",
            message=f"{label} has been {verb} for your account by RevGenIQ.",
            entity_type="feature",
            entity_id=module_key,
        )
    )


def _get_or_create_flag(db: Session, tenant_id: str, module_key: str) -> TenantFeatureFlag:
    flag = (
        db.query(TenantFeatureFlag)
        .filter(TenantFeatureFlag.tenant_id == tenant_id, TenantFeatureFlag.module_key == module_key)
        .first()
    )
    if flag:
        return flag
    settings = _get_settings(db, tenant_id)
    plan = settings.plan if settings else "basic"
    module = FEATURE_BY_KEY[module_key]
    defaults = set(get_plan_defaults(plan))
    flag = TenantFeatureFlag(
        tenant_id=tenant_id,
        module_key=module_key,
        status=_default_status(module, defaults),
        config={f["key"]: f["default"] for f in module["config_schema"]} or None,
    )
    db.add(flag)
    db.flush()
    return flag


def update_tenant_feature(
    db: Session,
    tenant_id: str,
    module_key: str,
    admin: AdminUser,
    *,
    status: str | None = None,
    hidden_from_nav: bool | None = None,
    access_level: str | None = None,
    config: dict[str, Any] | None = None,
    reason: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    _get_tenant(db, tenant_id)
    apply_due_schedules(db, tenant_id)
    if module_key not in FEATURE_BY_KEY:
        raise AdminFeatureError(404, "Unknown module")
    module = FEATURE_BY_KEY[module_key]

    if status is not None and status != "enabled" and module["always_on"]:
        raise AdminFeatureError(422, f"{module['label']} is a core module and can't be disabled.")

    if status == "enabled" and not module["is_implemented"]:
        raise AdminFeatureError(422, f"{module['label']} isn't built yet and can't be enabled for a tenant.")

    settings = _get_settings(db, tenant_id)
    app_version = settings.app_version if settings else "1.0.0"
    if status == "enabled" and not version_gte(app_version, module["min_version"]):
        raise AdminFeatureError(
            422,
            f"{module['label']} requires app version {module['min_version']}+ — this tenant is on {app_version}.",
        )

    if status is not None:
        impact = get_feature_impact(db, tenant_id, module_key, status)
        if impact["blocked"]:
            raise AdminFeatureError(422, impact["block_reason"] or "This change isn't allowed.")
        if impact["requires_confirmation"] and not force:
            dependent_labels = ", ".join(FEATURE_BY_KEY[d]["label"] for d in impact["affected_dependents"])
            raise AdminFeatureError(
                409,
                f"Disabling {module['label']} also affects: {dependent_labels}. Confirm to proceed.",
            )

    flag = _get_or_create_flag(db, tenant_id, module_key)
    previous_state = _flag_state(flag)

    action = "config_updated"
    status_changed = status is not None and status != flag.status
    if status_changed:
        action = status
        flag.status = status
    if hidden_from_nav is not None and hidden_from_nav != flag.hidden_from_nav:
        flag.hidden_from_nav = hidden_from_nav
        if action == "config_updated":
            action = "hidden_from_nav" if hidden_from_nav else "shown_in_nav"
    if access_level is not None and access_level != flag.access_level:
        flag.access_level = access_level
        if action == "config_updated":
            action = "access_level_changed"
    if config is not None:
        flag.config = config

    flag.updated_by_admin_id = admin.id
    flag.updated_by_admin_name = _admin_name(admin)
    flag.reason = reason
    db.add(flag)

    new_state = _flag_state(flag)
    db.add(
        TenantFeatureFlagHistory(
            tenant_id=tenant_id,
            module_key=module_key,
            action=action,
            previous_state=previous_state,
            new_state=new_state,
            changed_by_admin_id=admin.id,
            changed_by_admin_name=_admin_name(admin),
            reason=reason,
        )
    )

    if status_changed:
        _notify_tenant(db, tenant_id, module_key, status)  # type: ignore[arg-type]

    db.commit()
    return get_tenant_feature(db, tenant_id, module_key)


def bulk_update_feature(
    db: Session, tenant_ids: list[str], module_key: str, status: str, admin: AdminUser, reason: str | None = None
) -> dict[str, Any]:
    if module_key not in FEATURE_BY_KEY:
        raise AdminFeatureError(404, "Unknown module")
    updated: list[str] = []
    skipped: list[dict[str, str]] = []
    for tenant_id in tenant_ids:
        try:
            update_tenant_feature(db, tenant_id, module_key, admin, status=status, reason=reason, force=True)
            updated.append(tenant_id)
        except AdminFeatureError as exc:
            skipped.append({"tenant_id": tenant_id, "error": exc.message})
    return {"updated": updated, "skipped": skipped}


def bulk_update_tenant_modules(
    db: Session,
    tenant_id: str,
    module_keys: list[str],
    status: str,
    admin: AdminUser,
    reason: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Toggle many modules at once for a single tenant — the "Enable All"/"Disable All" actions
    scoped to whatever module set the admin is currently looking at (e.g. one domain tab)."""
    _get_tenant(db, tenant_id)
    requested = set(module_keys)
    updated: list[str] = []
    skipped: list[dict[str, str]] = []
    for key in topo_order():
        if key not in requested or key not in FEATURE_BY_KEY:
            continue
        try:
            update_tenant_feature(db, tenant_id, key, admin, status=status, reason=reason, force=force)
            updated.append(key)
        except AdminFeatureError as exc:
            skipped.append({"module_key": key, "error": exc.message})
    return {"updated": updated, "skipped": skipped}


def get_tenant_feature_summary(db: Session, tenant_id: str) -> dict[str, Any]:
    items = list_tenant_features(db, tenant_id)
    enabled_count = sum(1 for i in items if i["status"] == "enabled")
    disabled_count = sum(1 for i in items if i["status"] == "disabled")
    suspended_count = sum(1 for i in items if i["status"] == "suspended")
    custom_count = sum(1 for i in items if i["is_custom"])
    updated_ats = [i["updated_at"] for i in items if i["updated_at"]]
    return {
        "total_modules": len(items),
        "enabled_count": enabled_count,
        "disabled_count": disabled_count,
        "suspended_count": suspended_count,
        "custom_count": custom_count,
        "default_count": len(items) - custom_count,
        "last_updated": max(updated_ats) if updated_ats else None,
    }


def reset_to_plan_defaults(
    db: Session, tenant_id: str, admin: AdminUser, reason: str | None = None, module_keys: list[str] | None = None
) -> None:
    _get_tenant(db, tenant_id)
    query = db.query(TenantFeatureFlag).filter(TenantFeatureFlag.tenant_id == tenant_id)
    if module_keys is not None:
        query = query.filter(TenantFeatureFlag.module_key.in_(module_keys))
    flags = query.all()
    for flag in flags:
        db.add(
            TenantFeatureFlagHistory(
                tenant_id=tenant_id,
                module_key=flag.module_key,
                action="reset_to_default",
                previous_state=_flag_state(flag),
                new_state=None,
                changed_by_admin_id=admin.id,
                changed_by_admin_name=_admin_name(admin),
                reason=reason or "Reset to plan defaults",
            )
        )
        db.delete(flag)
    db.commit()


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


def _core_keys() -> list[str]:
    return [m["key"] for m in FEATURE_CATALOG if m["category"] == "core"]


def _system_template_defs() -> list[dict[str, Any]]:
    core = _core_keys()

    def mods(keys: list[str]) -> list[dict[str, Any]]:
        return [{"module_key": k, "status": "enabled", "config": None} for k in keys]

    return [
        {
            "name": "Retail Basic",
            "description": "Core POS and inventory for a single-location retail shop.",
            "modules": mods(core),
        },
        {
            "name": "Retail Premium",
            "description": "Retail Basic plus branding, WhatsApp and barcode printing.",
            "modules": mods([*core, "invoice_designer", "custom_branding", "advanced_analytics", "whatsapp_integration", "barcode_printing"]),
        },
        {
            "name": "Restaurant",
            "description": "Multi-branch dining with loyalty and a payment gateway.",
            "modules": mods([*core, "multi_branch", "loyalty", "sms_integration", "payment_gateway"]),
        },
        {
            "name": "Medical Store",
            "description": "Pharmacy-style retail with barcode scanning and API access.",
            "modules": mods([*core, "barcode_printing", "expenses", "api_access"]),
        },
        {
            "name": "Wholesale",
            "description": "Purchase, suppliers and warehouse management for bulk trade.",
            "modules": mods([*core, "purchase", "suppliers", "warehouse", "multi_branch"]),
        },
        {
            "name": "Supermarket",
            "description": "High-volume retail with multi-branch, loyalty and barcode printing.",
            "modules": mods([*core, "barcode_printing", "multi_branch", "loyalty", "invoice_designer"]),
        },
        {
            "name": "Enterprise",
            "description": "Every RevGen BillIQ module, fully enabled.",
            "modules": mods([m["key"] for m in FEATURE_CATALOG]),
        },
    ]


def ensure_system_templates(admin_db: Session) -> None:
    existing = {
        row.name for row in admin_db.query(FeatureTemplate.name).filter(FeatureTemplate.is_system.is_(True)).all()
    }
    changed = False
    for tpl in _system_template_defs():
        if tpl["name"] in existing:
            continue
        admin_db.add(
            FeatureTemplate(name=tpl["name"], description=tpl["description"], modules=tpl["modules"], is_system=True)
        )
        changed = True
    if changed:
        admin_db.commit()


def list_templates(admin_db: Session) -> list[FeatureTemplate]:
    ensure_system_templates(admin_db)
    return admin_db.query(FeatureTemplate).order_by(FeatureTemplate.is_system.desc(), FeatureTemplate.name.asc()).all()


def create_template(
    admin_db: Session, name: str, description: str | None, modules: list[dict[str, Any]], admin: AdminUser
) -> FeatureTemplate:
    template = FeatureTemplate(
        name=name,
        description=description,
        modules=modules,
        created_by_admin_id=admin.id,
        created_by_admin_name=_admin_name(admin),
    )
    admin_db.add(template)
    admin_db.commit()
    admin_db.refresh(template)
    return template


def delete_template(admin_db: Session, template_id: str) -> None:
    template = admin_db.get(FeatureTemplate, template_id)
    if not template:
        raise AdminFeatureError(404, "Template not found")
    if template.is_system:
        raise AdminFeatureError(422, "System templates can't be deleted.")
    admin_db.delete(template)
    admin_db.commit()


def assign_template_to_tenants(
    db: Session,
    admin_db: Session,
    template_id: str,
    tenant_ids: list[str],
    admin: AdminUser,
    reason: str | None = None,
) -> dict[str, Any]:
    template = admin_db.get(FeatureTemplate, template_id)
    if not template:
        raise AdminFeatureError(404, "Template not found")
    by_key = {m["module_key"]: m for m in template.modules}

    updated: list[str] = []
    skipped: list[dict[str, str]] = []
    for tenant_id in tenant_ids:
        try:
            _get_tenant(db, tenant_id)
            for key in topo_order():
                module = FEATURE_BY_KEY[key]
                if module["always_on"]:
                    continue
                entry = by_key.get(key)
                update_tenant_feature(
                    db,
                    tenant_id,
                    key,
                    admin,
                    status=entry["status"] if entry else "disabled",
                    config=entry.get("config") if entry else None,
                    reason=reason or f"Applied template: {template.name}",
                    force=True,
                )
            updated.append(tenant_id)
        except AdminFeatureError as exc:
            skipped.append({"tenant_id": tenant_id, "error": exc.message})
    return {"updated": updated, "skipped": skipped}


# ---------------------------------------------------------------------------
# History / rollback
# ---------------------------------------------------------------------------


def list_history(db: Session, tenant_id: str, module_key: str | None = None, limit: int = 200) -> list[TenantFeatureFlagHistory]:
    query = db.query(TenantFeatureFlagHistory).filter(TenantFeatureFlagHistory.tenant_id == tenant_id)
    if module_key:
        query = query.filter(TenantFeatureFlagHistory.module_key == module_key)
    return query.order_by(TenantFeatureFlagHistory.created_at.desc()).limit(limit).all()


def rollback_history(db: Session, tenant_id: str, history_id: str, admin: AdminUser) -> dict[str, Any]:
    entry = db.get(TenantFeatureFlagHistory, history_id)
    if not entry or entry.tenant_id != tenant_id:
        raise AdminFeatureError(404, "History entry not found")
    if not entry.previous_state:
        raise AdminFeatureError(422, "Nothing to roll back to for this entry.")
    prev = entry.previous_state
    when = entry.created_at.strftime("%d %b %Y %H:%M") if entry.created_at else "an earlier point"
    return update_tenant_feature(
        db,
        tenant_id,
        entry.module_key,
        admin,
        status=prev.get("status"),
        hidden_from_nav=prev.get("hidden_from_nav"),
        access_level=prev.get("access_level"),
        config=prev.get("config"),
        reason=f"Rolled back to the state from {when}",
        force=True,
    )


# ---------------------------------------------------------------------------
# Scheduling CRUD
# ---------------------------------------------------------------------------


def create_schedule(
    db: Session, tenant_id: str, module_key: str, action: str, scheduled_for: datetime, admin: AdminUser
) -> FeatureSchedule:
    _get_tenant(db, tenant_id)
    if module_key not in FEATURE_BY_KEY:
        raise AdminFeatureError(404, "Unknown module")
    if scheduled_for.tzinfo is None:
        scheduled_for = scheduled_for.replace(tzinfo=timezone.utc)
    if scheduled_for <= _now():
        raise AdminFeatureError(422, "Scheduled time must be in the future.")
    schedule = FeatureSchedule(
        tenant_id=tenant_id,
        module_key=module_key,
        action=action,
        scheduled_for=scheduled_for,
        created_by_admin_id=admin.id,
        created_by_admin_name=_admin_name(admin),
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


def list_schedules(db: Session, tenant_id: str) -> list[FeatureSchedule]:
    apply_due_schedules(db, tenant_id)
    return (
        db.query(FeatureSchedule)
        .filter(FeatureSchedule.tenant_id == tenant_id)
        .order_by(FeatureSchedule.scheduled_for.desc())
        .all()
    )


def cancel_schedule(db: Session, tenant_id: str, schedule_id: str) -> None:
    schedule = db.get(FeatureSchedule, schedule_id)
    if not schedule or schedule.tenant_id != tenant_id:
        raise AdminFeatureError(404, "Schedule not found")
    if schedule.status != "pending":
        raise AdminFeatureError(422, "Only pending schedules can be cancelled.")
    schedule.status = "cancelled"
    db.add(schedule)
    db.commit()


# ---------------------------------------------------------------------------
# Summary cards / customer list / analytics
# ---------------------------------------------------------------------------


def get_summary(db: Session) -> dict[str, Any]:
    total_customers = db.query(func.count(Tenant.id)).filter(Tenant.is_deleted.is_(False)).scalar() or 0
    active_customers = (
        db.query(func.count(Tenant.id)).filter(Tenant.is_deleted.is_(False), Tenant.status == "active").scalar() or 0
    )
    customers_with_custom_features = db.query(func.count(func.distinct(TenantFeatureFlag.tenant_id))).scalar() or 0
    default_configuration_customers = max(total_customers - customers_with_custom_features, 0)

    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    modules_enabled_today = (
        db.query(func.count(TenantFeatureFlagHistory.id))
        .filter(TenantFeatureFlagHistory.action == "enabled", TenantFeatureFlagHistory.created_at >= today_start)
        .scalar()
        or 0
    )
    modules_disabled_today = (
        db.query(func.count(TenantFeatureFlagHistory.id))
        .filter(TenantFeatureFlagHistory.action == "disabled", TenantFeatureFlagHistory.created_at >= today_start)
        .scalar()
        or 0
    )
    return {
        "total_customers": total_customers,
        "active_customers": active_customers,
        "customers_with_custom_features": customers_with_custom_features,
        "default_configuration_customers": default_configuration_customers,
        "modules_enabled_today": modules_enabled_today,
        "modules_disabled_today": modules_disabled_today,
    }


def list_customers_for_panel(
    db: Session,
    search: str | None = None,
    industry: str | None = None,
    plan: str | None = None,
    status: str | None = None,
    subscription_status: str | None = None,
    is_trial: bool | None = None,
    country: str | None = None,
) -> list[dict[str, Any]]:
    query = db.query(Tenant).filter(Tenant.is_deleted.is_(False))
    if status:
        query = query.filter(Tenant.status == status)
    if industry:
        query = query.filter(Tenant.industry == industry)
    if country:
        query = query.filter(Tenant.country == country)
    if search:
        like = f"%{search}%"
        query = query.filter((Tenant.company_name.ilike(like)) | (Tenant.email.ilike(like)))
    tenants = query.order_by(Tenant.company_name.asc()).all()

    results: list[dict[str, Any]] = []
    for tenant in tenants:
        settings = _get_settings(db, tenant.id)
        tenant_plan = settings.plan if settings else "basic"
        if plan and tenant_plan != plan:
            continue
        sub_status = settings.subscription_status if settings else "active"
        if subscription_status and sub_status != subscription_status:
            continue
        trial_ends_at = settings.trial_ends_at if settings else None
        tenant_is_trial = bool(trial_ends_at and trial_ends_at > _now())
        if is_trial is not None and tenant_is_trial != is_trial:
            continue

        owner = (
            db.query(User)
            .filter(User.tenant_id == tenant.id, User.role == "owner")
            .order_by(User.created_at.asc())
            .first()
        )
        items = list_tenant_features(db, tenant.id)
        modules_enabled_count = sum(1 for i in items if i["status"] == "enabled")
        has_custom_features = any(i["is_custom"] for i in items)

        results.append(
            {
                "tenant_id": tenant.id,
                "company_name": tenant.company_name,
                "industry": tenant.industry,
                "plan": tenant_plan,
                "status": tenant.status,
                "subscription_status": sub_status,
                "is_trial": tenant_is_trial,
                "country": tenant.country,
                "app_version": settings.app_version if settings else "1.0.0",
                "modules_enabled_count": modules_enabled_count,
                "has_custom_features": has_custom_features,
                "last_login": owner.last_login if owner else None,
                "created_at": tenant.created_at,
                "trial_ends_at": trial_ends_at,
            }
        )
    return results


def get_analytics(db: Session) -> dict[str, Any]:
    tenants = db.query(Tenant).filter(Tenant.is_deleted.is_(False)).all()
    module_counts: dict[str, int] = {m["key"]: 0 for m in FEATURE_CATALOG}
    plan_counts: dict[str, int] = {}
    module_count_buckets: dict[str, int] = {}

    for tenant in tenants:
        items = list_tenant_features(db, tenant.id)
        enabled_count = 0
        for item in items:
            if item["status"] == "enabled":
                module_counts[item["module_key"]] += 1
                enabled_count += 1
        settings = _get_settings(db, tenant.id)
        plan_label = PLAN_DISPLAY_NAMES.get(settings.plan if settings else "basic", "Starter")
        plan_counts[plan_label] = plan_counts.get(plan_label, 0) + 1
        bucket_start = (enabled_count // 5) * 5
        bucket = f"{bucket_start}-{bucket_start + 4}"
        module_count_buckets[bucket] = module_count_buckets.get(bucket, 0) + 1

    total = len(tenants) or 1

    def label_count(pairs: list[tuple[str, int]]) -> list[dict[str, Any]]:
        return [
            {
                "module_key": k,
                "label": FEATURE_BY_KEY[k]["label"],
                "count": c,
                "percentage": round(c / total * 100, 1),
            }
            for k, c in pairs
        ]

    non_always_on = sorted(
        ((k, c) for k, c in module_counts.items() if not FEATURE_BY_KEY[k]["always_on"]),
        key=lambda kv: kv[1],
        reverse=True,
    )
    most_enabled = label_count(non_always_on[:5])
    least_enabled = label_count(list(reversed(non_always_on))[:5])

    adoption_rate = []
    for cat in ("core", "business", "ai", "premium"):
        cat_modules = [m["key"] for m in FEATURE_CATALOG if m["category"] == cat]
        possible = len(cat_modules) * total or 1
        actual = sum(module_counts[k] for k in cat_modules)
        adoption_rate.append({"category": cat, "label": CATEGORY_LABELS[cat], "percentage": round(actual / possible * 100, 1)})

    premium_usage = label_count(
        sorted(((k, c) for k, c in module_counts.items() if FEATURE_BY_KEY[k]["category"] == "premium"), key=lambda kv: kv[1], reverse=True)
    )
    ai_usage = label_count(
        sorted(((k, c) for k, c in module_counts.items() if FEATURE_BY_KEY[k]["category"] == "ai"), key=lambda kv: kv[1], reverse=True)
    )

    customers_by_plan = [{"plan": k, "count": v} for k, v in plan_counts.items()]
    customers_by_module_count = [{"bucket": k, "count": v} for k, v in sorted(module_count_buckets.items())]

    return {
        "most_enabled": most_enabled,
        "least_enabled": least_enabled,
        "adoption_rate": adoption_rate,
        "premium_usage": premium_usage,
        "ai_usage": ai_usage,
        "customers_by_plan": customers_by_plan,
        "customers_by_module_count": customers_by_module_count,
    }


# ---------------------------------------------------------------------------
# Real-time gating consumed by the tenant-facing app (GET /api/feature-flags)
# ---------------------------------------------------------------------------


def get_enabled_flags_for_tenant(db: Session, tenant_id: str) -> dict[str, bool]:
    items = list_tenant_features(db, tenant_id)
    return {item["module_key"]: item["status"] == "enabled" for item in items}


def get_effective_flags_for_tenant(db: Session, tenant_id: str) -> dict[str, bool]:
    """Like `get_enabled_flags_for_tenant`, but cascaded through each module's `requires` chain —
    a module whose prerequisite is disabled resolves to `False` here even if its own stored flag
    says "enabled". This is what the tenant-facing app should always consult (nav visibility,
    `assert_feature`); the raw per-module status from `get_enabled_flags_for_tenant`/
    `list_tenant_features` stays available for the admin UI, which needs to show/edit each
    module's own stored value independently rather than a pre-collapsed cascade.
    """
    own = get_enabled_flags_for_tenant(db, tenant_id)
    effective: dict[str, bool] = {}
    for key in topo_order():
        module = FEATURE_BY_KEY[key]
        effective[key] = own.get(key, False) and all(effective.get(req, False) for req in module["requires"])
    return effective
