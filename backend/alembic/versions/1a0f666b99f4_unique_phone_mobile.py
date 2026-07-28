"""unique phone/mobile per tenant and user

Revision ID: 1a0f666b99f4
Revises: d4e5f6a7b8c9
Create Date: 2026-07-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '1a0f666b99f4'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite has no ALTER-based ADD CONSTRAINT, so this needs batch mode (which recreates the
    # table); on Postgres batch mode just issues a plain ALTER TABLE ADD CONSTRAINT.
    with op.batch_alter_table('users') as batch_op:
        batch_op.create_unique_constraint('uq_users_mobile', ['mobile'])
    with op.batch_alter_table('tenants') as batch_op:
        batch_op.create_unique_constraint('uq_tenants_phone', ['phone'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('tenants') as batch_op:
        batch_op.drop_constraint('uq_tenants_phone', type_='unique')
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_constraint('uq_users_mobile', type_='unique')
