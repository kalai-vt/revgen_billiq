"""invoice client_reference_id for checkout idempotency

Revision ID: d2e5b7f14c33
Revises: c1c9a1a03a10
Create Date: 2026-08-12 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e5b7f14c33'
down_revision: Union[str, Sequence[str], None] = 'c1c9a1a03a10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('invoices') as batch_op:
        batch_op.add_column(sa.Column('client_reference_id', sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint('uq_invoices_tenant_client_reference', ['tenant_id', 'client_reference_id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('invoices') as batch_op:
        batch_op.drop_constraint('uq_invoices_tenant_client_reference', type_='unique')
        batch_op.drop_column('client_reference_id')
