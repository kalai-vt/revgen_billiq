"""add invoice taxable_amount and tax_percentage

Revision ID: cd14ad66dfa9
Revises: d65755b5a98b
Create Date: 2026-07-22 14:18:32.314761

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cd14ad66dfa9'
down_revision: Union[str, Sequence[str], None] = 'd65755b5a98b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('invoices', sa.Column('taxable_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('invoices', sa.Column('tax_percentage', sa.Float(), nullable=False, server_default='0'))
    # Backfill historical invoices: taxable_amount is exactly reconstructable
    # from existing columns; tax_percentage is a best-effort derived rate since
    # the old per-product tax model had no single invoice-level rate.
    op.execute("UPDATE invoices SET taxable_amount = subtotal - discount_amount")
    op.execute(
        "UPDATE invoices SET tax_percentage = "
        "CASE WHEN taxable_amount > 0 THEN ROUND(tax_amount / taxable_amount * 100, 2) ELSE 0 END"
    )
    # Note: no create_foreign_key for products.category_id here — SQLite cannot
    # ALTER-add an FK constraint without a full table rebuild (batch mode), and
    # FK enforcement isn't enabled anywhere in this app; see the equivalent note
    # in 45ee19d853cb_add_categories_customers_settings_split_.py.


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('invoices', 'tax_percentage')
    op.drop_column('invoices', 'taxable_amount')
