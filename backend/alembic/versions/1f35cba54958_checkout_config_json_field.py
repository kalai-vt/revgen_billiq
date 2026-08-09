"""checkout config json field

Revision ID: 1f35cba54958
Revises: db26f1a4e938
Create Date: 2026-08-10 00:09:02.098326

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1f35cba54958'
down_revision: Union[str, Sequence[str], None] = 'db26f1a4e938'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('settings', sa.Column('checkout_config', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('settings', 'checkout_config')
