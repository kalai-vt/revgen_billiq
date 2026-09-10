"""add invoice payment reference

Revision ID: d4c9e7f13a58
Revises: c8f5a3b21e47
Create Date: 2026-09-10 13:30:00.000000

Where a UPI/card transaction id gets recorded at the till. Collections against an outstanding
invoice already had `payments.reference_number`, but a bill settled at checkout had nowhere to put
it — so a UPI payment could never be matched back to a bank statement line, which is exactly the
reconciliation the reference exists for. Nullable, because cash has no reference.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4c9e7f13a58'
down_revision: Union[str, Sequence[str], None] = 'c8f5a3b21e47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('invoices', sa.Column('payment_reference', sa.String(length=80), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('invoices', 'payment_reference')
