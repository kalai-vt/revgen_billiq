"""add auto_print_device_mode to settings

Revision ID: a4d21f9c7e33
Revises: 56b6c7cc51ea
Create Date: 2026-09-10 10:20:00.000000

The printer name and paper size were already tenant-wide, but the transport used to reach
that printer lived only in each browser's localStorage. A till set up in a different browser
(or with site data cleared) therefore had a fully-configured-looking Settings page and no way
to reach the printer, so every print silently fell through to the system print dialog.
Storing the transport alongside the printer name closes that gap; NULL means "never
configured", which the app now reports instead of guessing a transport.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4d21f9c7e33'
down_revision: Union[str, Sequence[str], None] = '56b6c7cc51ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'settings',
        sa.Column('auto_print_device_mode', sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('settings', 'auto_print_device_mode')
