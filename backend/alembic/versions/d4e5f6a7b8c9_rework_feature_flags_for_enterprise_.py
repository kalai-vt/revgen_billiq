"""rework feature flags for enterprise feature management

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-27 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tenants', sa.Column('industry', sa.String(length=50), nullable=True))
    op.add_column('settings', sa.Column('app_version', sa.String(length=20), nullable=False, server_default='1.0.0'))

    op.add_column('tenant_feature_flags', sa.Column('status', sa.String(length=20), nullable=False, server_default='enabled'))
    op.add_column('tenant_feature_flags', sa.Column('hidden_from_nav', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('tenant_feature_flags', sa.Column('access_level', sa.String(length=20), nullable=False, server_default='full_access'))
    op.add_column('tenant_feature_flags', sa.Column('config', sa.JSON(), nullable=True))
    op.add_column('tenant_feature_flags', sa.Column('updated_by_admin_id', sa.String(length=36), nullable=True))
    op.add_column('tenant_feature_flags', sa.Column('updated_by_admin_name', sa.String(length=200), nullable=True))
    op.add_column('tenant_feature_flags', sa.Column('reason', sa.Text(), nullable=True))

    # Backfill status from the old boolean before dropping it.
    op.execute("UPDATE tenant_feature_flags SET status = CASE WHEN enabled THEN 'enabled' ELSE 'disabled' END")
    op.drop_column('tenant_feature_flags', 'enabled')

    op.create_table(
        'tenant_feature_flag_history',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('module_key', sa.String(length=50), nullable=False),
        sa.Column('action', sa.String(length=30), nullable=False),
        sa.Column('previous_state', sa.JSON(), nullable=True),
        sa.Column('new_state', sa.JSON(), nullable=True),
        sa.Column('changed_by_admin_id', sa.String(length=36), nullable=False),
        sa.Column('changed_by_admin_name', sa.String(length=200), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_tenant_feature_flag_history_tenant_id', 'tenant_feature_flag_history', ['tenant_id'])
    op.create_index('ix_tenant_feature_flag_history_module_key', 'tenant_feature_flag_history', ['module_key'])
    op.create_index('ix_tenant_feature_flag_history_created_at', 'tenant_feature_flag_history', ['created_at'])

    op.create_table(
        'feature_schedules',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('module_key', sa.String(length=50), nullable=False),
        sa.Column('action', sa.String(length=20), nullable=False),
        sa.Column('scheduled_for', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('created_by_admin_id', sa.String(length=36), nullable=False),
        sa.Column('created_by_admin_name', sa.String(length=200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_feature_schedules_tenant_id', 'feature_schedules', ['tenant_id'])
    op.create_index('ix_feature_schedules_scheduled_for', 'feature_schedules', ['scheduled_for'])
    op.create_index('ix_feature_schedules_status', 'feature_schedules', ['status'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_feature_schedules_status', table_name='feature_schedules')
    op.drop_index('ix_feature_schedules_scheduled_for', table_name='feature_schedules')
    op.drop_index('ix_feature_schedules_tenant_id', table_name='feature_schedules')
    op.drop_table('feature_schedules')

    op.drop_index('ix_tenant_feature_flag_history_created_at', table_name='tenant_feature_flag_history')
    op.drop_index('ix_tenant_feature_flag_history_module_key', table_name='tenant_feature_flag_history')
    op.drop_index('ix_tenant_feature_flag_history_tenant_id', table_name='tenant_feature_flag_history')
    op.drop_table('tenant_feature_flag_history')

    op.add_column('tenant_feature_flags', sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE tenant_feature_flags SET enabled = (status = 'enabled')")
    op.drop_column('tenant_feature_flags', 'reason')
    op.drop_column('tenant_feature_flags', 'updated_by_admin_name')
    op.drop_column('tenant_feature_flags', 'updated_by_admin_id')
    op.drop_column('tenant_feature_flags', 'config')
    op.drop_column('tenant_feature_flags', 'access_level')
    op.drop_column('tenant_feature_flags', 'hidden_from_nav')
    op.drop_column('tenant_feature_flags', 'status')

    op.drop_column('settings', 'app_version')
    op.drop_column('tenants', 'industry')
