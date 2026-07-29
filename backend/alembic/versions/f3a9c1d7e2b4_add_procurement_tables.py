"""add procurement tables (vendors, purchase entries, purchase entry items)

Revision ID: f3a9c1d7e2b4
Revises: d8e21f4a6b3c
Create Date: 2026-07-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a9c1d7e2b4'
down_revision: Union[str, Sequence[str], None] = 'd8e21f4a6b3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'vendors',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('company_name', sa.String(length=200), nullable=True),
        sa.Column('contact_person', sa.String(length=150), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('gst_number', sa.String(length=30), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('payment_terms_days', sa.Integer(), nullable=True),
        sa.Column('credit_limit', sa.Float(), nullable=False),
        sa.Column('outstanding_amount', sa.Float(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vendors_tenant_id'), 'vendors', ['tenant_id'])
    op.create_index(op.f('ix_vendors_name'), 'vendors', ['name'])
    op.create_index(op.f('ix_vendors_phone'), 'vendors', ['phone'])

    op.create_table(
        'purchase_entries',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('vendor_id', sa.String(length=36), nullable=False),
        sa.Column('purchase_number', sa.String(length=40), nullable=False),
        sa.Column('vendor_invoice_number', sa.String(length=100), nullable=True),
        sa.Column('purchase_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('subtotal', sa.Float(), nullable=False),
        sa.Column('discount_amount', sa.Float(), nullable=False),
        sa.Column('tax_amount', sa.Float(), nullable=False),
        sa.Column('total_amount', sa.Float(), nullable=False),
        sa.Column('payment_mode', sa.String(length=20), nullable=True),
        sa.Column('payment_status', sa.String(length=20), nullable=False),
        sa.Column('paid_amount', sa.Float(), nullable=False),
        sa.Column('outstanding_amount', sa.Float(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('cancelled_by', sa.String(length=36), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancel_reason', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['cancelled_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_purchase_entries_tenant_id'), 'purchase_entries', ['tenant_id'])
    op.create_index(op.f('ix_purchase_entries_vendor_id'), 'purchase_entries', ['vendor_id'])
    op.create_index(op.f('ix_purchase_entries_purchase_number'), 'purchase_entries', ['purchase_number'])
    op.create_index(op.f('ix_purchase_entries_status'), 'purchase_entries', ['status'])
    op.create_index(op.f('ix_purchase_entries_created_at'), 'purchase_entries', ['created_at'])

    op.create_table(
        'purchase_entry_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('purchase_entry_id', sa.String(length=36), nullable=False),
        sa.Column('product_id', sa.String(length=36), nullable=False),
        sa.Column('product_name', sa.String(length=200), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(length=30), nullable=True),
        sa.Column('unit_cost_price', sa.Float(), nullable=False),
        sa.Column('tax_rate_percent', sa.Float(), nullable=False),
        sa.Column('tax_amount', sa.Float(), nullable=False),
        sa.Column('discount_amount', sa.Float(), nullable=False),
        sa.Column('line_subtotal', sa.Float(), nullable=False),
        sa.Column('line_total', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['purchase_entry_id'], ['purchase_entries.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_purchase_entry_items_purchase_entry_id'), 'purchase_entry_items', ['purchase_entry_id'])
    op.create_index(op.f('ix_purchase_entry_items_product_id'), 'purchase_entry_items', ['product_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_purchase_entry_items_product_id'), table_name='purchase_entry_items')
    op.drop_index(op.f('ix_purchase_entry_items_purchase_entry_id'), table_name='purchase_entry_items')
    op.drop_table('purchase_entry_items')

    op.drop_index(op.f('ix_purchase_entries_created_at'), table_name='purchase_entries')
    op.drop_index(op.f('ix_purchase_entries_status'), table_name='purchase_entries')
    op.drop_index(op.f('ix_purchase_entries_purchase_number'), table_name='purchase_entries')
    op.drop_index(op.f('ix_purchase_entries_vendor_id'), table_name='purchase_entries')
    op.drop_index(op.f('ix_purchase_entries_tenant_id'), table_name='purchase_entries')
    op.drop_table('purchase_entries')

    op.drop_index(op.f('ix_vendors_phone'), table_name='vendors')
    op.drop_index(op.f('ix_vendors_name'), table_name='vendors')
    op.drop_index(op.f('ix_vendors_tenant_id'), table_name='vendors')
    op.drop_table('vendors')
