"""add restaurant floors/tables/orders/KOTs and UPI merchant settings

Revision ID: b7e4f2a9c15d
Revises: a4d21f9c7e33
Create Date: 2026-09-10 12:00:00.000000

Adds the dine-in chain Table -> Order -> KOT -> Invoice (restaurant_orders.invoice_id is the link
back to the ordinary sales invoice, so a dine-in bill is never a parallel sale), plus the two
settings columns a payable UPI QR needs. `upi_vpa` in particular is what the existing payment QR
was missing: a `upi://pay` link with no `pa=` payee is not payable by any UPI app.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e4f2a9c15d'
down_revision: Union[str, Sequence[str], None] = 'a4d21f9c7e33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('settings', sa.Column('upi_vpa', sa.String(length=255), nullable=True))
    op.add_column('settings', sa.Column('upi_merchant_name', sa.String(length=100), nullable=True))

    op.create_table(
        'restaurant_floors',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'name', name='uq_restaurant_floors_tenant_name'),
    )
    op.create_index(op.f('ix_restaurant_floors_tenant_id'), 'restaurant_floors', ['tenant_id'])

    op.create_table(
        'restaurant_tables',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('floor_id', sa.String(length=36), nullable=True),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('seats', sa.Integer(), nullable=False, server_default='4'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='available'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['floor_id'], ['restaurant_floors.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'name', name='uq_restaurant_tables_tenant_name'),
    )
    op.create_index(op.f('ix_restaurant_tables_tenant_id'), 'restaurant_tables', ['tenant_id'])
    op.create_index(op.f('ix_restaurant_tables_floor_id'), 'restaurant_tables', ['floor_id'])
    op.create_index(op.f('ix_restaurant_tables_status'), 'restaurant_tables', ['status'])

    op.create_table(
        'restaurant_orders',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('table_id', sa.String(length=36), nullable=True),
        sa.Column('order_number', sa.String(length=30), nullable=False),
        sa.Column('order_type', sa.String(length=20), nullable=False, server_default='dine_in'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='open'),
        sa.Column('customer_id', sa.String(length=36), nullable=True),
        sa.Column('customer_name', sa.String(length=150), nullable=True),
        sa.Column('customer_phone', sa.String(length=50), nullable=True),
        sa.Column('guest_count', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('invoice_id', sa.String(length=36), nullable=True),
        sa.Column('merged_into_order_id', sa.String(length=36), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['table_id'], ['restaurant_tables.id']),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id']),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id']),
        sa.ForeignKeyConstraint(['merged_into_order_id'], ['restaurant_orders.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'order_number', name='uq_restaurant_orders_tenant_number'),
    )
    op.create_index(op.f('ix_restaurant_orders_tenant_id'), 'restaurant_orders', ['tenant_id'])
    op.create_index(op.f('ix_restaurant_orders_table_id'), 'restaurant_orders', ['table_id'])
    op.create_index(op.f('ix_restaurant_orders_order_number'), 'restaurant_orders', ['order_number'])
    op.create_index(op.f('ix_restaurant_orders_status'), 'restaurant_orders', ['status'])
    op.create_index(op.f('ix_restaurant_orders_invoice_id'), 'restaurant_orders', ['invoice_id'])
    op.create_index(op.f('ix_restaurant_orders_created_at'), 'restaurant_orders', ['created_at'])

    op.create_table(
        'restaurant_order_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('order_id', sa.String(length=36), nullable=False),
        sa.Column('product_id', sa.String(length=36), nullable=False),
        sa.Column('product_name', sa.String(length=200), nullable=False),
        sa.Column('identifier_value', sa.String(length=80), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('unit_price', sa.Float(), nullable=False),
        sa.Column('tax_rate_percent', sa.Float(), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('sent_quantity', sa.Float(), nullable=False, server_default='0'),
        sa.Column('is_cancelled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['restaurant_orders.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_restaurant_order_items_order_id'), 'restaurant_order_items', ['order_id'])

    op.create_table(
        'kots',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('order_id', sa.String(length=36), nullable=False),
        sa.Column('kot_number', sa.String(length=30), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('cancel_reason', sa.Text(), nullable=True),
        sa.Column('cancelled_by', sa.String(length=36), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('print_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['order_id'], ['restaurant_orders.id']),
        sa.ForeignKeyConstraint(['cancelled_by'], ['users.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'kot_number', name='uq_kots_tenant_number'),
    )
    op.create_index(op.f('ix_kots_tenant_id'), 'kots', ['tenant_id'])
    op.create_index(op.f('ix_kots_order_id'), 'kots', ['order_id'])
    op.create_index(op.f('ix_kots_kot_number'), 'kots', ['kot_number'])
    op.create_index(op.f('ix_kots_status'), 'kots', ['status'])
    op.create_index(op.f('ix_kots_created_at'), 'kots', ['created_at'])

    op.create_table(
        'kot_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('kot_id', sa.String(length=36), nullable=False),
        sa.Column('order_item_id', sa.String(length=36), nullable=False),
        sa.Column('product_name', sa.String(length=200), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['kot_id'], ['kots.id']),
        sa.ForeignKeyConstraint(['order_item_id'], ['restaurant_order_items.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_kot_items_kot_id'), 'kot_items', ['kot_id'])
    op.create_index(op.f('ix_kot_items_order_item_id'), 'kot_items', ['order_item_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('kot_items')
    op.drop_table('kots')
    op.drop_table('restaurant_order_items')
    op.drop_table('restaurant_orders')
    op.drop_table('restaurant_tables')
    op.drop_table('restaurant_floors')
    op.drop_column('settings', 'upi_merchant_name')
    op.drop_column('settings', 'upi_vpa')
