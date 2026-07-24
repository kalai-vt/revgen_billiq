from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.plans import PlanConfig, get_plan
from app.models.settings import Settings


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


def assert_under_limit(db: Session, tenant_id: str, limit_key: str, current_count: int) -> None:
    plan = get_plan_config(db, tenant_id)
    limit = plan[limit_key]  # type: ignore[literal-required]
    if limit is not None and current_count >= limit:
        raise LimitExceededError(
            f"{plan['label']} plan limit reached ({limit}). Upgrade your plan to add more."
        )


def assert_feature(db: Session, tenant_id: str, feature_key: str) -> None:
    plan = get_plan_config(db, tenant_id)
    if not plan["features"][feature_key]:  # type: ignore[literal-required]
        raise FeatureNotAvailableError(
            f"This feature isn't available on the {plan['label']} plan. Upgrade to unlock it."
        )
