"""trial/subscription lifecycle fields + collapse explore into advance plan

Revision ID: db26f1a4e938
Revises: b3d8e5a2c7f1
Create Date: 2026-08-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'db26f1a4e938'
down_revision: Union[str, Sequence[str], None] = 'b3d8e5a2c7f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('settings', sa.Column('trial_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('settings', sa.Column('subscription_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('settings', sa.Column('subscription_ends_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('settings', sa.Column('suspended_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('settings', sa.Column('suspension_reason', sa.String(length=50), nullable=True))
    op.add_column('settings', sa.Column('reactivated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('settings', sa.Column('reactivated_by', sa.String(length=200), nullable=True))

    # Plan tiers changed from basic/explore/advance to BASIC/ADVANCED/CUSTOM (app/core/plans.py) —
    # "advance" already granted a superset of "explore"'s features and limits (see the plan
    # config this replaces), so remapping every "explore" tenant to "advance" only ever *adds*
    # capability, never removes any. This does not touch any TenantFeatureFlag row, so a tenant
    # who had specific modules individually granted/revoked keeps exactly that configuration —
    # only the plan-level default set changes (see PLAN_DEFAULT_MODULES in feature_catalog.py).
    op.execute("UPDATE settings SET plan = 'advance' WHERE plan = 'explore'")


def downgrade() -> None:
    """Downgrade schema."""
    # Deliberately not reversing the explore->advance data remap: which "advance" rows used to be
    # "explore" is not recoverable once merged, and re-splitting them isn't a schema concern.
    op.drop_column('settings', 'reactivated_by')
    op.drop_column('settings', 'reactivated_at')
    op.drop_column('settings', 'suspension_reason')
    op.drop_column('settings', 'suspended_at')
    op.drop_column('settings', 'subscription_ends_at')
    op.drop_column('settings', 'subscription_started_at')
    op.drop_column('settings', 'trial_started_at')
