"""configurable product identifiers

Revision ID: d65755b5a98b
Revises: 02fa97fef862
Create Date: 2026-07-22 13:03:23.483968

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd65755b5a98b'
down_revision: Union[str, Sequence[str], None] = '02fa97fef862'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('product_identifiers',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=36), nullable=False),
    sa.Column('product_id', sa.String(length=36), nullable=False),
    sa.Column('identifier_type', sa.String(length=20), nullable=False),
    sa.Column('identifier_label', sa.String(length=50), nullable=True),
    sa.Column('identifier_value', sa.String(length=80), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_product_identifiers_identifier_value'), 'product_identifiers', ['identifier_value'], unique=False)
    op.create_index(op.f('ix_product_identifiers_product_id'), 'product_identifiers', ['product_id'], unique=False)
    op.create_index(op.f('ix_product_identifiers_tenant_id'), 'product_identifiers', ['tenant_id'], unique=False)

    # invoice_items.sku -> identifier_type/identifier_value, backfilling existing
    # snapshot rows from the old sku column before dropping it.
    op.add_column('invoice_items', sa.Column('identifier_type', sa.String(length=20), nullable=True))
    op.add_column('invoice_items', sa.Column('identifier_value', sa.String(length=80), nullable=False, server_default=''))
    op.execute("UPDATE invoice_items SET identifier_type = 'sku', identifier_value = sku")
    op.drop_column('invoice_items', 'sku')

    # products.sku -> identifier_type/identifier_label/identifier_value, same
    # backfill approach: existing products become identifier_type='sku' with
    # their old sku value preserved as identifier_value.
    op.add_column('products', sa.Column('identifier_type', sa.String(length=20), nullable=False, server_default='pid'))
    op.add_column('products', sa.Column('identifier_label', sa.String(length=50), nullable=True))
    op.add_column('products', sa.Column('identifier_value', sa.String(length=80), nullable=False, server_default=''))
    op.execute("UPDATE products SET identifier_type = 'sku', identifier_value = sku")
    op.drop_index(op.f('ix_products_sku'), table_name='products')
    op.create_index(op.f('ix_products_identifier_value'), 'products', ['identifier_value'], unique=False)
    # Note: no create_foreign_key for products.category_id here — SQLite cannot
    # ALTER-add an FK constraint without a full table rebuild (batch mode), and
    # FK enforcement isn't enabled anywhere in this app; see the equivalent note
    # in 45ee19d853cb_add_categories_customers_settings_split_.py.
    op.drop_column('products', 'sku')

    op.add_column('settings', sa.Column('primary_search_field', sa.String(length=20), nullable=False, server_default='identifier_value'))
    op.add_column('settings', sa.Column('default_identifier_type', sa.String(length=20), nullable=False, server_default='pid'))
    op.add_column('settings', sa.Column('enable_multiple_identifiers', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('settings', sa.Column('require_unique_identifier', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('settings', 'require_unique_identifier')
    op.drop_column('settings', 'enable_multiple_identifiers')
    op.drop_column('settings', 'default_identifier_type')
    op.drop_column('settings', 'primary_search_field')

    op.add_column('products', sa.Column('sku', sa.VARCHAR(length=80), nullable=False, server_default=''))
    op.execute("UPDATE products SET sku = identifier_value")
    op.drop_index(op.f('ix_products_identifier_value'), table_name='products')
    op.create_index(op.f('ix_products_sku'), 'products', ['sku'], unique=False)
    op.drop_column('products', 'identifier_value')
    op.drop_column('products', 'identifier_label')
    op.drop_column('products', 'identifier_type')

    op.add_column('invoice_items', sa.Column('sku', sa.VARCHAR(length=80), nullable=False, server_default=''))
    op.execute("UPDATE invoice_items SET sku = identifier_value")
    op.drop_column('invoice_items', 'identifier_value')
    op.drop_column('invoice_items', 'identifier_type')

    op.drop_index(op.f('ix_product_identifiers_tenant_id'), table_name='product_identifiers')
    op.drop_index(op.f('ix_product_identifiers_product_id'), table_name='product_identifiers')
    op.drop_index(op.f('ix_product_identifiers_identifier_value'), table_name='product_identifiers')
    op.drop_table('product_identifiers')
