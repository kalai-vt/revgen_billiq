"""add indexes for sortable and filtered columns

Revision ID: acd374f16db2
Revises: 04ed10e5b221
Create Date: 2026-07-24 17:41:32.143327

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'acd374f16db2'
down_revision: Union[str, Sequence[str], None] = '04ed10e5b221'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(op.f('ix_customers_email'), 'customers', ['email'], unique=False)
    op.create_index(op.f('ix_inventory_quantity'), 'inventory', ['quantity'], unique=False)
    op.create_index(op.f('ix_inventory_updated_at'), 'inventory', ['updated_at'], unique=False)
    op.create_index(op.f('ix_invoices_created_at'), 'invoices', ['created_at'], unique=False)
    op.create_index(op.f('ix_invoices_total_amount'), 'invoices', ['total_amount'], unique=False)
    op.create_index(op.f('ix_products_cost_price'), 'products', ['cost_price'], unique=False)
    op.create_index(op.f('ix_products_name'), 'products', ['name'], unique=False)
    op.create_index(op.f('ix_products_selling_price'), 'products', ['selling_price'], unique=False)
    op.create_index(op.f('ix_products_tax_rate_percent'), 'products', ['tax_rate_percent'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_products_tax_rate_percent'), table_name='products')
    op.drop_index(op.f('ix_products_selling_price'), table_name='products')
    op.drop_index(op.f('ix_products_name'), table_name='products')
    op.drop_index(op.f('ix_products_cost_price'), table_name='products')
    op.drop_index(op.f('ix_invoices_total_amount'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_created_at'), table_name='invoices')
    op.drop_index(op.f('ix_inventory_updated_at'), table_name='inventory')
    op.drop_index(op.f('ix_inventory_quantity'), table_name='inventory')
    op.drop_index(op.f('ix_customers_email'), table_name='customers')
