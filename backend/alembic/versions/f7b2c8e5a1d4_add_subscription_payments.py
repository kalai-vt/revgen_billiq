"""add subscription payments

Revision ID: f7b2c8e5a1d4
Revises: e1f4b7c2a9d3
Create Date: 2026-07-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7b2c8e5a1d4'
down_revision: Union[str, Sequence[str], None] = 'e1f4b7c2a9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'subscription_payments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('plan', sa.String(length=20), nullable=False),
        sa.Column('amount_inr', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('razorpay_order_id', sa.String(length=64), nullable=False),
        sa.Column('razorpay_payment_id', sa.String(length=64), nullable=True),
        sa.Column('failure_reason', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_subscription_payments_tenant_id'), 'subscription_payments', ['tenant_id'])
    op.create_index(op.f('ix_subscription_payments_status'), 'subscription_payments', ['status'])
    op.create_index(op.f('ix_subscription_payments_razorpay_order_id'), 'subscription_payments', ['razorpay_order_id'])
    op.create_index(op.f('ix_subscription_payments_created_at'), 'subscription_payments', ['created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_subscription_payments_created_at'), table_name='subscription_payments')
    op.drop_index(op.f('ix_subscription_payments_razorpay_order_id'), table_name='subscription_payments')
    op.drop_index(op.f('ix_subscription_payments_status'), table_name='subscription_payments')
    op.drop_index(op.f('ix_subscription_payments_tenant_id'), table_name='subscription_payments')
    op.drop_table('subscription_payments')
