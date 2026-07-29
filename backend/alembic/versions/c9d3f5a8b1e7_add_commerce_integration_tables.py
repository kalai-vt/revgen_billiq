"""add commerce integration tables (configs, orders, order items, product mappings, sync logs)

Revision ID: c9d3f5a8b1e7
Revises: a7c2e9f14d6b
Create Date: 2026-07-29 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d3f5a8b1e7'
down_revision: Union[str, Sequence[str], None] = 'a7c2e9f14d6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'commerce_integration_configs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('platform', sa.String(length=20), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('mode', sa.String(length=10), nullable=False),
        sa.Column('api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('api_secret_encrypted', sa.Text(), nullable=True),
        sa.Column('store_id', sa.String(length=100), nullable=True),
        sa.Column('store_name', sa.String(length=200), nullable=True),
        sa.Column('webhook_token', sa.String(length=64), nullable=False),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_sync_status', sa.String(length=20), nullable=True),
        sa.Column('auto_create_invoice', sa.Boolean(), nullable=False),
        sa.Column('configured_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['configured_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'platform', name='uq_commerce_config_tenant_platform'),
    )
    op.create_index(op.f('ix_commerce_integration_configs_tenant_id'), 'commerce_integration_configs', ['tenant_id'])
    op.create_index(op.f('ix_commerce_integration_configs_platform'), 'commerce_integration_configs', ['platform'])
    op.create_index(op.f('ix_commerce_integration_configs_webhook_token'), 'commerce_integration_configs', ['webhook_token'], unique=True)

    op.create_table(
        'commerce_orders',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('platform', sa.String(length=20), nullable=False),
        sa.Column('integration_config_id', sa.String(length=36), nullable=False),
        sa.Column('platform_order_id', sa.String(length=100), nullable=False),
        sa.Column('order_status', sa.String(length=20), nullable=False),
        sa.Column('raw_status', sa.String(length=50), nullable=True),
        sa.Column('order_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('customer_name', sa.String(length=150), nullable=True),
        sa.Column('customer_phone', sa.String(length=50), nullable=True),
        sa.Column('subtotal', sa.Float(), nullable=False),
        sa.Column('platform_discount', sa.Float(), nullable=False),
        sa.Column('platform_commission', sa.Float(), nullable=False),
        sa.Column('packaging_charge', sa.Float(), nullable=False),
        sa.Column('tax_amount', sa.Float(), nullable=False),
        sa.Column('total_amount', sa.Float(), nullable=False),
        sa.Column('payout_amount', sa.Float(), nullable=False),
        sa.Column('invoice_id', sa.String(length=36), nullable=True),
        sa.Column('sync_error', sa.Text(), nullable=True),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['integration_config_id'], ['commerce_integration_configs.id']),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'platform', 'platform_order_id', name='uq_commerce_order_tenant_platform_order'),
    )
    op.create_index(op.f('ix_commerce_orders_tenant_id'), 'commerce_orders', ['tenant_id'])
    op.create_index(op.f('ix_commerce_orders_platform'), 'commerce_orders', ['platform'])
    op.create_index(op.f('ix_commerce_orders_integration_config_id'), 'commerce_orders', ['integration_config_id'])
    op.create_index(op.f('ix_commerce_orders_platform_order_id'), 'commerce_orders', ['platform_order_id'])
    op.create_index(op.f('ix_commerce_orders_order_status'), 'commerce_orders', ['order_status'])
    op.create_index(op.f('ix_commerce_orders_invoice_id'), 'commerce_orders', ['invoice_id'])
    op.create_index(op.f('ix_commerce_orders_created_at'), 'commerce_orders', ['created_at'])

    op.create_table(
        'commerce_order_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('commerce_order_id', sa.String(length=36), nullable=False),
        sa.Column('product_id', sa.String(length=36), nullable=True),
        sa.Column('platform_sku', sa.String(length=100), nullable=False),
        sa.Column('item_name', sa.String(length=200), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('unit_price', sa.Float(), nullable=False),
        sa.Column('line_total', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['commerce_order_id'], ['commerce_orders.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_commerce_order_items_commerce_order_id'), 'commerce_order_items', ['commerce_order_id'])

    op.create_table(
        'commerce_product_mappings',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('platform', sa.String(length=20), nullable=False),
        sa.Column('platform_sku', sa.String(length=100), nullable=False),
        sa.Column('platform_item_name', sa.String(length=200), nullable=True),
        sa.Column('product_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'platform', 'platform_sku', name='uq_commerce_mapping_tenant_platform_sku'),
    )
    op.create_index(op.f('ix_commerce_product_mappings_tenant_id'), 'commerce_product_mappings', ['tenant_id'])
    op.create_index(op.f('ix_commerce_product_mappings_platform'), 'commerce_product_mappings', ['platform'])
    op.create_index(op.f('ix_commerce_product_mappings_platform_sku'), 'commerce_product_mappings', ['platform_sku'])
    op.create_index(op.f('ix_commerce_product_mappings_product_id'), 'commerce_product_mappings', ['product_id'])

    op.create_table(
        'commerce_sync_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('integration_config_id', sa.String(length=36), nullable=False),
        sa.Column('platform', sa.String(length=20), nullable=False),
        sa.Column('sync_type', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('orders_processed', sa.Integer(), nullable=False),
        sa.Column('orders_failed', sa.Integer(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['integration_config_id'], ['commerce_integration_configs.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_commerce_sync_logs_tenant_id'), 'commerce_sync_logs', ['tenant_id'])
    op.create_index(op.f('ix_commerce_sync_logs_integration_config_id'), 'commerce_sync_logs', ['integration_config_id'])
    op.create_index(op.f('ix_commerce_sync_logs_platform'), 'commerce_sync_logs', ['platform'])
    op.create_index(op.f('ix_commerce_sync_logs_started_at'), 'commerce_sync_logs', ['started_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_commerce_sync_logs_started_at'), table_name='commerce_sync_logs')
    op.drop_index(op.f('ix_commerce_sync_logs_platform'), table_name='commerce_sync_logs')
    op.drop_index(op.f('ix_commerce_sync_logs_integration_config_id'), table_name='commerce_sync_logs')
    op.drop_index(op.f('ix_commerce_sync_logs_tenant_id'), table_name='commerce_sync_logs')
    op.drop_table('commerce_sync_logs')

    op.drop_index(op.f('ix_commerce_product_mappings_product_id'), table_name='commerce_product_mappings')
    op.drop_index(op.f('ix_commerce_product_mappings_platform_sku'), table_name='commerce_product_mappings')
    op.drop_index(op.f('ix_commerce_product_mappings_platform'), table_name='commerce_product_mappings')
    op.drop_index(op.f('ix_commerce_product_mappings_tenant_id'), table_name='commerce_product_mappings')
    op.drop_table('commerce_product_mappings')

    op.drop_index(op.f('ix_commerce_order_items_commerce_order_id'), table_name='commerce_order_items')
    op.drop_table('commerce_order_items')

    op.drop_index(op.f('ix_commerce_orders_created_at'), table_name='commerce_orders')
    op.drop_index(op.f('ix_commerce_orders_invoice_id'), table_name='commerce_orders')
    op.drop_index(op.f('ix_commerce_orders_order_status'), table_name='commerce_orders')
    op.drop_index(op.f('ix_commerce_orders_platform_order_id'), table_name='commerce_orders')
    op.drop_index(op.f('ix_commerce_orders_integration_config_id'), table_name='commerce_orders')
    op.drop_index(op.f('ix_commerce_orders_platform'), table_name='commerce_orders')
    op.drop_index(op.f('ix_commerce_orders_tenant_id'), table_name='commerce_orders')
    op.drop_table('commerce_orders')

    op.drop_index(op.f('ix_commerce_integration_configs_webhook_token'), table_name='commerce_integration_configs')
    op.drop_index(op.f('ix_commerce_integration_configs_platform'), table_name='commerce_integration_configs')
    op.drop_index(op.f('ix_commerce_integration_configs_tenant_id'), table_name='commerce_integration_configs')
    op.drop_table('commerce_integration_configs')
