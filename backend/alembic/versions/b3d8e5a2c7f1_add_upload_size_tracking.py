"""add upload size tracking (avatar, logo)

Revision ID: b3d8e5a2c7f1
Revises: f7b2c8e5a1d4
Create Date: 2026-07-30 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3d8e5a2c7f1'
down_revision: Union[str, Sequence[str], None] = 'f7b2c8e5a1d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('avatar_size_bytes', sa.Integer(), nullable=True))
    op.add_column('settings', sa.Column('logo_size_bytes', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('settings', 'logo_size_bytes')
    op.drop_column('users', 'avatar_size_bytes')
