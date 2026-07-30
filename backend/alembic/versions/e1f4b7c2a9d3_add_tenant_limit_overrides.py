"""add tenant limit overrides

Revision ID: e1f4b7c2a9d3
Revises: c9d3f5a8b1e7
Create Date: 2026-07-30 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f4b7c2a9d3'
down_revision: Union[str, Sequence[str], None] = 'c9d3f5a8b1e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'tenant_limit_overrides',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('limit_key', sa.String(length=50), nullable=False),
        sa.Column('limit_value', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.String(length=200), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'limit_key', name='uq_tenant_limit_overrides_tenant_key'),
    )
    op.create_index(op.f('ix_tenant_limit_overrides_tenant_id'), 'tenant_limit_overrides', ['tenant_id'])
    op.create_index(op.f('ix_tenant_limit_overrides_limit_key'), 'tenant_limit_overrides', ['limit_key'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_tenant_limit_overrides_limit_key'), table_name='tenant_limit_overrides')
    op.drop_index(op.f('ix_tenant_limit_overrides_tenant_id'), table_name='tenant_limit_overrides')
    op.drop_table('tenant_limit_overrides')
