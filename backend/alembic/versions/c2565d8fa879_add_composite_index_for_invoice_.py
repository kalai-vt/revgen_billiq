"""add composite index for invoice analytics queries

Revision ID: c2565d8fa879
Revises: 1a0f666b99f4
Create Date: 2026-07-28 19:42:36.733510

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2565d8fa879'
down_revision: Union[str, Sequence[str], None] = '1a0f666b99f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        op.f('ix_invoices_tenant_id_status_created_at'),
        'invoices',
        ['tenant_id', 'status', 'created_at'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_invoices_tenant_id_status_created_at'), table_name='invoices')
