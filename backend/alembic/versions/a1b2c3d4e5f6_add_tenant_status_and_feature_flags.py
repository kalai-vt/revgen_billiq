"""add tenant status and feature flags

Revision ID: a1b2c3d4e5f6
Revises: f3a8b1c4d9e2
Create Date: 2026-07-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f3a8b1c4d9e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tenants', sa.Column('status', sa.String(length=20), nullable=False, server_default='active'))

    op.create_table(
        'tenant_feature_flags',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('module_key', sa.String(length=50), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('tenant_id', 'module_key', name='uq_tenant_feature_flags_tenant_module'),
    )
    op.create_index('ix_tenant_feature_flags_tenant_id', 'tenant_feature_flags', ['tenant_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_tenant_feature_flags_tenant_id', table_name='tenant_feature_flags')
    op.drop_table('tenant_feature_flags')
    op.drop_column('tenants', 'status')
