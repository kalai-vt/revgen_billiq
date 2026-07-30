from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.plans import PlanConfig, get_plan
from app.models.settings import Settings
from app.models.tenant_limit import TenantLimitOverride
from app.models.user import User

# Numeric plan-limit keys a Super Admin can override per tenant. Mirrors the shape of
# `get_effective_flags_for_tenant` in `app/modules/admin_features/service.py` — an override row
# beats the plan default, and a `None`/NULL value always means unlimited.
LIMIT_KEYS = (
    "max_users",
    "max_products",
    "max_customers",
    "max_monthly_invoices",
    "max_branches",
    "max_warehouses",
    "max_storage_mb",
)


class LimitExceededError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


class FeatureNotAvailableError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


def get_plan_config(db: Session, tenant_id: str) -> PlanConfig:
    settings = db.query(Settings).filter(Settings.tenant_id == tenant_id).first()
    plan_id = settings.plan if settings else "basic"
    return get_plan(plan_id)


def get_effective_limits(db: Session, tenant_id: str) -> dict[str, int | None]:
    """Per-tenant numeric limits: a `TenantLimitOverride` row wins over the plan's default for
    that key; keys with no override fall back to the plan's static value."""
    plan = get_plan_config(db, tenant_id)
    effective: dict[str, int | None] = {key: plan[key] for key in LIMIT_KEYS}  # type: ignore[literal-required]
    overrides = db.query(TenantLimitOverride).filter(TenantLimitOverride.tenant_id == tenant_id).all()
    for override in overrides:
        if override.limit_key in effective:
            effective[override.limit_key] = override.limit_value
    return effective


def assert_under_limit(db: Session, tenant_id: str, limit_key: str, current_count: int) -> None:
    plan = get_plan_config(db, tenant_id)
    limit = get_effective_limits(db, tenant_id)[limit_key]
    if limit is not None and current_count >= limit:
        raise LimitExceededError(
            f"{plan['label']} plan limit reached ({limit}). Upgrade your plan to add more."
        )


def assert_feature(db: Session, tenant_id: str, feature_key: str) -> None:
    # Some plan-tier features (e.g. "advanced_analytics") are also modules the RevGenIQ Admin
    # Portal's Feature Management page can enable per-tenant, overriding the plan default — so
    # the admin's cascaded effective-flags computation (override if set else plan default, then
    # cascaded through each module's `requires` chain so a disabled prerequisite also disables
    # its dependents) is authoritative here, not the raw static plan matrix. Keys with no catalog
    # module equivalent (e.g. "user_management", "barcode_support") aren't in this map, so they
    # fall through to the plan-only check below unchanged.
    from app.modules.admin_features.service import get_effective_flags_for_tenant

    flags = get_effective_flags_for_tenant(db, tenant_id)
    if feature_key in flags:
        if not flags[feature_key]:
            plan = get_plan_config(db, tenant_id)
            raise FeatureNotAvailableError(
                f"This feature isn't available on the {plan['label']} plan. Upgrade to unlock it."
            )
        return

    plan = get_plan_config(db, tenant_id)
    if not plan["features"][feature_key]:  # type: ignore[literal-required]
        raise FeatureNotAvailableError(
            f"This feature isn't available on the {plan['label']} plan. Upgrade to unlock it."
        )


def require_feature(feature_key: str) -> Callable[..., None]:
    """Router-level dependency form of `assert_feature`, for routers where every endpoint
    belongs to the same catalog module (e.g. all of `categories/router.py` is "categories") —
    apply once via `APIRouter(..., dependencies=[Depends(require_feature("categories"))])`
    instead of repeating the call in every endpoint. Mixed-concern routers (e.g. sales/payments,
    which combine multiple module keys under one file) should keep calling `assert_feature`
    inline per-endpoint instead.
    """

    def dependency(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
        assert_feature(db, current_user.tenant_id, feature_key)

    return dependency
