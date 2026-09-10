"""add kitchen (KOT) printer settings

Revision ID: c8f5a3b21e47
Revises: b7e4f2a9c15d
Create Date: 2026-09-10 13:00:00.000000

A KOT prints on a machine by the kitchen pass while the bill prints at the till, so the kitchen
printer cannot share `auto_print_printer_name`. NULL means "use the billing printer", which keeps
a single-printer shop working with no extra setup.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8f5a3b21e47'
down_revision: Union[str, Sequence[str], None] = 'b7e4f2a9c15d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('settings', sa.Column('kot_printer_name', sa.String(length=255), nullable=True))
    op.add_column(
        'settings',
        sa.Column('kot_paper_size', sa.String(length=10), nullable=False, server_default='80mm'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('settings', 'kot_paper_size')
    op.drop_column('settings', 'kot_printer_name')
