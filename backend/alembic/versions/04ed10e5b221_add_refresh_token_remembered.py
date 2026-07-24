"""add refresh token remembered flag

Revision ID: 04ed10e5b221
Revises: a4358eccb52c
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '04ed10e5b221'
down_revision: Union[str, Sequence[str], None] = 'a4358eccb52c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'refresh_tokens',
        sa.Column('remembered', sa.Boolean(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('refresh_tokens', 'remembered')
