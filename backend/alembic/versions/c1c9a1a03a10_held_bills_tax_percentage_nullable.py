"""held_bills tax_percentage nullable

Revision ID: c1c9a1a03a10
Revises: 8cf8f04e8798
Create Date: 2026-08-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1c9a1a03a10'
down_revision: Union[str, Sequence[str], None] = '8cf8f04e8798'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # None now means "no manual tax override was set when this bill was held" — auto
    # per-product tax applies on resume, matching invoices.tax_percentage's own contract.
    with op.batch_alter_table('held_bills') as batch_op:
        batch_op.alter_column('tax_percentage', existing_type=sa.Float(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('held_bills') as batch_op:
        batch_op.alter_column('tax_percentage', existing_type=sa.Float(), nullable=False, server_default='0')
