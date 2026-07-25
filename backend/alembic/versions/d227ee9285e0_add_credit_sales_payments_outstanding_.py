"""add credit sales payments outstanding tracking

Revision ID: d227ee9285e0
Revises: 18672a35b0f1
Create Date: 2026-07-25 14:07:41.732877

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd227ee9285e0'
down_revision: Union[str, Sequence[str], None] = '18672a35b0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Invoices: payment tracking is a separate concern from the existing `status` column
    # (which already means return/void state — paid/partial/refunded/cancelled).
    op.add_column('invoices', sa.Column('payment_status', sa.String(length=20), nullable=False, server_default='paid'))
    op.add_column('invoices', sa.Column('due_date', sa.Date(), nullable=True))
    op.add_column('invoices', sa.Column('paid_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('invoices', sa.Column('outstanding_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('invoices', sa.Column('payment_terms', sa.String(length=50), nullable=True))
    # Backfill: every invoice before this feature existed was paid in full at checkout.
    op.execute("UPDATE invoices SET paid_amount = total_amount, outstanding_amount = 0")

    # Customers: credit settings, all optional per the "never mandatory" requirement.
    op.add_column('customers', sa.Column('is_credit_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('customers', sa.Column('credit_limit', sa.Float(), nullable=True))
    op.add_column('customers', sa.Column('credit_days', sa.Integer(), nullable=True))
    op.add_column('customers', sa.Column('allow_credit_beyond_limit', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('customers', sa.Column('require_manager_approval', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('customers', sa.Column('auto_block_credit', sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        'payments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('customer_id', sa.String(length=36), nullable=False),
        sa.Column('payment_number', sa.String(length=30), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('payment_method', sa.String(length=20), nullable=False),
        sa.Column('reference_number', sa.String(length=80), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('received_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id']),
        sa.ForeignKeyConstraint(['received_by'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_payments_tenant_id'), 'payments', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_payments_customer_id'), 'payments', ['customer_id'], unique=False)
    op.create_index(op.f('ix_payments_created_at'), 'payments', ['created_at'], unique=False)

    op.create_table(
        'payment_allocations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('payment_id', sa.String(length=36), nullable=False),
        sa.Column('invoice_id', sa.String(length=36), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id']),
        sa.ForeignKeyConstraint(['payment_id'], ['payments.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_payment_allocations_payment_id'), 'payment_allocations', ['payment_id'], unique=False)
    op.create_index(op.f('ix_payment_allocations_invoice_id'), 'payment_allocations', ['invoice_id'], unique=False)

    op.create_table(
        'customer_ledger_adjustments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('customer_id', sa.String(length=36), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_customer_ledger_adjustments_tenant_id'), 'customer_ledger_adjustments', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_customer_ledger_adjustments_customer_id'), 'customer_ledger_adjustments', ['customer_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_customer_ledger_adjustments_customer_id'), table_name='customer_ledger_adjustments')
    op.drop_index(op.f('ix_customer_ledger_adjustments_tenant_id'), table_name='customer_ledger_adjustments')
    op.drop_table('customer_ledger_adjustments')

    op.drop_index(op.f('ix_payment_allocations_invoice_id'), table_name='payment_allocations')
    op.drop_index(op.f('ix_payment_allocations_payment_id'), table_name='payment_allocations')
    op.drop_table('payment_allocations')

    op.drop_index(op.f('ix_payments_created_at'), table_name='payments')
    op.drop_index(op.f('ix_payments_customer_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_tenant_id'), table_name='payments')
    op.drop_table('payments')

    op.drop_column('customers', 'auto_block_credit')
    op.drop_column('customers', 'require_manager_approval')
    op.drop_column('customers', 'allow_credit_beyond_limit')
    op.drop_column('customers', 'credit_days')
    op.drop_column('customers', 'credit_limit')
    op.drop_column('customers', 'is_credit_enabled')

    op.drop_column('invoices', 'payment_terms')
    op.drop_column('invoices', 'outstanding_amount')
    op.drop_column('invoices', 'paid_amount')
    op.drop_column('invoices', 'due_date')
    op.drop_column('invoices', 'payment_status')
