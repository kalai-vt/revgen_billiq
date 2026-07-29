"""add purchase returns and vendor payments tables

Revision ID: a7c2e9f14d6b
Revises: f3a9c1d7e2b4
Create Date: 2026-07-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c2e9f14d6b'
down_revision: Union[str, Sequence[str], None] = 'f3a9c1d7e2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('purchase_entry_items', sa.Column('returned_quantity', sa.Float(), nullable=False, server_default='0'))

    op.create_table(
        'purchase_returns',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('purchase_entry_id', sa.String(length=36), nullable=False),
        sa.Column('vendor_id', sa.String(length=36), nullable=False),
        sa.Column('return_number', sa.String(length=40), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('subtotal_amount', sa.Float(), nullable=False),
        sa.Column('tax_adjustment', sa.Float(), nullable=False),
        sa.Column('refund_amount', sa.Float(), nullable=False),
        sa.Column('refund_method', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('cancelled_by', sa.String(length=36), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancel_reason', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['purchase_entry_id'], ['purchase_entries.id']),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['cancelled_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_purchase_returns_tenant_id'), 'purchase_returns', ['tenant_id'])
    op.create_index(op.f('ix_purchase_returns_purchase_entry_id'), 'purchase_returns', ['purchase_entry_id'])
    op.create_index(op.f('ix_purchase_returns_vendor_id'), 'purchase_returns', ['vendor_id'])
    op.create_index(op.f('ix_purchase_returns_return_number'), 'purchase_returns', ['return_number'])
    op.create_index(op.f('ix_purchase_returns_status'), 'purchase_returns', ['status'])
    op.create_index(op.f('ix_purchase_returns_created_at'), 'purchase_returns', ['created_at'])

    op.create_table(
        'purchase_return_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('purchase_return_id', sa.String(length=36), nullable=False),
        sa.Column('purchase_entry_item_id', sa.String(length=36), nullable=False),
        sa.Column('product_id', sa.String(length=36), nullable=False),
        sa.Column('product_name', sa.String(length=200), nullable=False),
        sa.Column('quantity_returned', sa.Float(), nullable=False),
        sa.Column('unit_cost_price', sa.Float(), nullable=False),
        sa.Column('line_refund_amount', sa.Float(), nullable=False),
        sa.Column('reason', sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(['purchase_return_id'], ['purchase_returns.id']),
        sa.ForeignKeyConstraint(['purchase_entry_item_id'], ['purchase_entry_items.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_purchase_return_items_purchase_return_id'), 'purchase_return_items', ['purchase_return_id'])
    op.create_index(op.f('ix_purchase_return_items_purchase_entry_item_id'), 'purchase_return_items', ['purchase_entry_item_id'])
    op.create_index(op.f('ix_purchase_return_items_product_id'), 'purchase_return_items', ['product_id'])

    op.create_table(
        'vendor_payments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('vendor_id', sa.String(length=36), nullable=False),
        sa.Column('payment_number', sa.String(length=40), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('payment_method', sa.String(length=20), nullable=False),
        sa.Column('reference_number', sa.String(length=80), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('paid_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id']),
        sa.ForeignKeyConstraint(['paid_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vendor_payments_tenant_id'), 'vendor_payments', ['tenant_id'])
    op.create_index(op.f('ix_vendor_payments_vendor_id'), 'vendor_payments', ['vendor_id'])
    op.create_index(op.f('ix_vendor_payments_payment_number'), 'vendor_payments', ['payment_number'])
    op.create_index(op.f('ix_vendor_payments_created_at'), 'vendor_payments', ['created_at'])

    op.create_table(
        'vendor_payment_allocations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('vendor_payment_id', sa.String(length=36), nullable=False),
        sa.Column('purchase_entry_id', sa.String(length=36), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['vendor_payment_id'], ['vendor_payments.id']),
        sa.ForeignKeyConstraint(['purchase_entry_id'], ['purchase_entries.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vendor_payment_allocations_vendor_payment_id'), 'vendor_payment_allocations', ['vendor_payment_id'])
    op.create_index(op.f('ix_vendor_payment_allocations_purchase_entry_id'), 'vendor_payment_allocations', ['purchase_entry_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_vendor_payment_allocations_purchase_entry_id'), table_name='vendor_payment_allocations')
    op.drop_index(op.f('ix_vendor_payment_allocations_vendor_payment_id'), table_name='vendor_payment_allocations')
    op.drop_table('vendor_payment_allocations')

    op.drop_index(op.f('ix_vendor_payments_created_at'), table_name='vendor_payments')
    op.drop_index(op.f('ix_vendor_payments_payment_number'), table_name='vendor_payments')
    op.drop_index(op.f('ix_vendor_payments_vendor_id'), table_name='vendor_payments')
    op.drop_index(op.f('ix_vendor_payments_tenant_id'), table_name='vendor_payments')
    op.drop_table('vendor_payments')

    op.drop_index(op.f('ix_purchase_return_items_product_id'), table_name='purchase_return_items')
    op.drop_index(op.f('ix_purchase_return_items_purchase_entry_item_id'), table_name='purchase_return_items')
    op.drop_index(op.f('ix_purchase_return_items_purchase_return_id'), table_name='purchase_return_items')
    op.drop_table('purchase_return_items')

    op.drop_index(op.f('ix_purchase_returns_created_at'), table_name='purchase_returns')
    op.drop_index(op.f('ix_purchase_returns_status'), table_name='purchase_returns')
    op.drop_index(op.f('ix_purchase_returns_return_number'), table_name='purchase_returns')
    op.drop_index(op.f('ix_purchase_returns_vendor_id'), table_name='purchase_returns')
    op.drop_index(op.f('ix_purchase_returns_purchase_entry_id'), table_name='purchase_returns')
    op.drop_index(op.f('ix_purchase_returns_tenant_id'), table_name='purchase_returns')
    op.drop_table('purchase_returns')

    op.drop_column('purchase_entry_items', 'returned_quantity')
