"""add inventory module tables

Revision ID: 051f531cc5ff
Revises: cd14ad66dfa9
Create Date: 2026-07-22 16:32:20.953610

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '051f531cc5ff'
down_revision: Union[str, Sequence[str], None] = 'cd14ad66dfa9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('inventory_import_history',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=36), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('source_type', sa.String(length=20), nullable=False),
    sa.Column('column_mapping', sa.JSON(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('rows_total', sa.Integer(), nullable=False),
    sa.Column('rows_imported', sa.Integer(), nullable=False),
    sa.Column('rows_failed', sa.Integer(), nullable=False),
    sa.Column('imported_by', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['imported_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inventory_import_history_tenant_id'), 'inventory_import_history', ['tenant_id'], unique=False)
    op.create_table('inventory',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=36), nullable=False),
    sa.Column('product_id', sa.String(length=36), nullable=False),
    sa.Column('quantity', sa.Float(), nullable=False),
    sa.Column('reorder_level', sa.Float(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inventory_product_id'), 'inventory', ['product_id'], unique=True)
    op.create_index(op.f('ix_inventory_tenant_id'), 'inventory', ['tenant_id'], unique=False)
    op.create_table('inventory_import_rows',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=36), nullable=False),
    sa.Column('import_id', sa.String(length=36), nullable=False),
    sa.Column('row_number', sa.Integer(), nullable=False),
    sa.Column('raw_data', sa.JSON(), nullable=False),
    sa.Column('matched_product_id', sa.String(length=36), nullable=True),
    sa.Column('quantity', sa.Float(), nullable=True),
    sa.Column('cost_price', sa.Float(), nullable=True),
    sa.Column('selling_price', sa.Float(), nullable=True),
    sa.Column('tax_percent', sa.Float(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('error_messages', sa.JSON(), nullable=True),
    sa.Column('is_skipped', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['import_id'], ['inventory_import_history.id'], ),
    sa.ForeignKeyConstraint(['matched_product_id'], ['products.id'], ),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_inventory_import_rows_import_id'), 'inventory_import_rows', ['import_id'], unique=False)
    op.create_index(op.f('ix_inventory_import_rows_tenant_id'), 'inventory_import_rows', ['tenant_id'], unique=False)
    op.create_table('stock_history',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('tenant_id', sa.String(length=36), nullable=False),
    sa.Column('product_id', sa.String(length=36), nullable=False),
    sa.Column('previous_stock', sa.Float(), nullable=False),
    sa.Column('added', sa.Float(), nullable=False),
    sa.Column('removed', sa.Float(), nullable=False),
    sa.Column('current_stock', sa.Float(), nullable=False),
    sa.Column('reason', sa.String(length=30), nullable=False),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('reference_id', sa.String(length=36), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stock_history_created_at'), 'stock_history', ['created_at'], unique=False)
    op.create_index(op.f('ix_stock_history_product_id'), 'stock_history', ['product_id'], unique=False)
    op.create_index(op.f('ix_stock_history_tenant_id'), 'stock_history', ['tenant_id'], unique=False)
    # Note: no create_foreign_key for products.category_id here — SQLite cannot
    # ALTER-add an FK constraint without a full table rebuild (batch mode), and
    # FK enforcement isn't enabled anywhere in this app; see the equivalent note
    # in 45ee19d853cb_add_categories_customers_settings_split_.py.

    # Backfill: every existing product gets a matching inventory row (quantity=0,
    # default reorder_level=5) so the rest of the app never has to defensively
    # handle a product without one.
    op.execute(
        "INSERT INTO inventory (id, tenant_id, product_id, quantity, reorder_level, updated_at) "
        "SELECT lower(hex(randomblob(16))), tenant_id, id, 0, 5, CURRENT_TIMESTAMP FROM products"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_stock_history_tenant_id'), table_name='stock_history')
    op.drop_index(op.f('ix_stock_history_product_id'), table_name='stock_history')
    op.drop_index(op.f('ix_stock_history_created_at'), table_name='stock_history')
    op.drop_table('stock_history')
    op.drop_index(op.f('ix_inventory_import_rows_tenant_id'), table_name='inventory_import_rows')
    op.drop_index(op.f('ix_inventory_import_rows_import_id'), table_name='inventory_import_rows')
    op.drop_table('inventory_import_rows')
    op.drop_index(op.f('ix_inventory_tenant_id'), table_name='inventory')
    op.drop_index(op.f('ix_inventory_product_id'), table_name='inventory')
    op.drop_table('inventory')
    op.drop_index(op.f('ix_inventory_import_history_tenant_id'), table_name='inventory_import_history')
    op.drop_table('inventory_import_history')
