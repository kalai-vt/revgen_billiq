"""add return status refund method and item disposition

Revision ID: 18672a35b0f1
Revises: acd374f16db2
Create Date: 2026-07-25 13:04:07.043102

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '18672a35b0f1'
down_revision: Union[str, Sequence[str], None] = 'acd374f16db2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('returns', sa.Column('status', sa.String(length=20), nullable=False, server_default='fully_refunded'))
    # Widen from String(10): 'bank_transfer' (13 chars) wouldn't fit the old column. SQLite has no
    # ALTER COLUMN, so this needs batch mode (which recreates the table); on Postgres batch mode
    # just issues a plain ALTER.
    with op.batch_alter_table('returns') as batch_op:
        batch_op.alter_column(
            'refund_method',
            existing_type=sa.String(length=10),
            type_=sa.String(length=20),
            nullable=False,
            server_default='cash',
        )
    op.add_column('returns', sa.Column('subtotal_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('returns', sa.Column('discount_adjustment', sa.Float(), nullable=False, server_default='0'))
    op.add_column('returns', sa.Column('tax_adjustment', sa.Float(), nullable=False, server_default='0'))
    op.add_column('returns', sa.Column('round_off', sa.Float(), nullable=False, server_default='0'))
    op.add_column('returns', sa.Column('cancelled_by', sa.String(length=36), nullable=True))
    op.add_column('returns', sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('returns', sa.Column('cancel_reason', sa.Text(), nullable=True))

    op.add_column('return_items', sa.Column('identifier_value', sa.String(length=80), nullable=False, server_default=''))
    op.add_column('return_items', sa.Column('reason', sa.String(length=30), nullable=False, server_default='other'))
    op.add_column('return_items', sa.Column('condition', sa.String(length=20), nullable=False, server_default='sellable'))
    op.add_column(
        'return_items', sa.Column('inventory_action', sa.String(length=20), nullable=False, server_default='return_to_stock')
    )
    op.add_column('return_items', sa.Column('restocked', sa.Boolean(), nullable=False, server_default=sa.true()))
    # Note: no create_foreign_key for returns.cancelled_by -> users.id here — SQLite cannot
    # ALTER-add an FK constraint without a full table rebuild (batch mode), and FK enforcement
    # isn't enabled anywhere in this app; see the equivalent note in
    # 45ee19d853cb_add_categories_customers_settings_split_.py.


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('return_items', 'restocked')
    op.drop_column('return_items', 'inventory_action')
    op.drop_column('return_items', 'condition')
    op.drop_column('return_items', 'reason')
    op.drop_column('return_items', 'identifier_value')

    op.drop_column('returns', 'cancel_reason')
    op.drop_column('returns', 'cancelled_at')
    op.drop_column('returns', 'cancelled_by')
    op.drop_column('returns', 'round_off')
    op.drop_column('returns', 'tax_adjustment')
    op.drop_column('returns', 'discount_adjustment')
    op.drop_column('returns', 'subtotal_amount')
    with op.batch_alter_table('returns') as batch_op:
        batch_op.alter_column(
            'refund_method',
            existing_type=sa.String(length=20),
            type_=sa.String(length=10),
            nullable=True,
            server_default=None,
        )
    op.drop_column('returns', 'status')
