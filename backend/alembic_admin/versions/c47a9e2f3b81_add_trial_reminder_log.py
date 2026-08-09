"""add trial reminder log

Revision ID: c47a9e2f3b81
Revises: c3d4e5f6a7b8
Create Date: 2026-08-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c47a9e2f3b81'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'trial_reminder_log',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('company_name', sa.String(length=255), nullable=False),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.Column('template', sa.String(length=100), nullable=False),
        sa.Column('sent_by_admin_id', sa.String(length=36), nullable=False),
        sa.Column('sent_by_admin_name', sa.String(length=200), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('provider_message_id', sa.String(length=200), nullable=True),
        sa.Column('failure_reason', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['sent_by_admin_id'], ['admin_users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_trial_reminder_log_tenant_id'), 'trial_reminder_log', ['tenant_id'])
    op.create_index(op.f('ix_trial_reminder_log_sent_by_admin_id'), 'trial_reminder_log', ['sent_by_admin_id'])
    op.create_index(op.f('ix_trial_reminder_log_created_at'), 'trial_reminder_log', ['created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_trial_reminder_log_created_at'), table_name='trial_reminder_log')
    op.drop_index(op.f('ix_trial_reminder_log_sent_by_admin_id'), table_name='trial_reminder_log')
    op.drop_index(op.f('ix_trial_reminder_log_tenant_id'), table_name='trial_reminder_log')
    op.drop_table('trial_reminder_log')
