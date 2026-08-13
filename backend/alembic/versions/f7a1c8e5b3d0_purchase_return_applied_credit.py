"""purchase return applied_credit_amount for vendor ledger reconciliation

Revision ID: f7a1c8e5b3d0
Revises: d2e5b7f14c33
Create Date: 2026-08-12 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a1c8e5b3d0'
down_revision: Union[str, Sequence[str], None] = 'd2e5b7f14c33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('purchase_returns') as batch_op:
        batch_op.add_column(sa.Column('applied_credit_amount', sa.Float(), nullable=False, server_default='0'))
    # Historical rows predate the (refund, outstanding) cap being recorded — best-effort backfill
    # preserves their current ledger contribution unchanged rather than guessing a historical cap.
    op.execute("UPDATE purchase_returns SET applied_credit_amount = refund_amount WHERE status != 'cancelled'")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('purchase_returns') as batch_op:
        batch_op.drop_column('applied_credit_amount')
