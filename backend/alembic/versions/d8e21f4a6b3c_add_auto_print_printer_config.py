"""add auto print printer name and paper size to settings

Revision ID: d8e21f4a6b3c
Revises: c2565d8fa879
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8e21f4a6b3c'
down_revision: Union[str, Sequence[str], None] = 'c2565d8fa879'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('settings', sa.Column('auto_print_printer_name', sa.String(length=255), nullable=True))
    op.add_column(
        'settings',
        sa.Column('auto_print_paper_size', sa.String(length=10), nullable=False, server_default='80mm'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('settings', 'auto_print_paper_size')
    op.drop_column('settings', 'auto_print_printer_name')
