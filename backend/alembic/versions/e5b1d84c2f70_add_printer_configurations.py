"""add printer configurations

Revision ID: e5b1d84c2f70
Revises: d4c9e7f13a58
Create Date: 2026-09-10 18:30:00.000000

Additional print destinations per tenant — the kitchen printer today, a bar or tandoor printer
later. The billing printer's configuration deliberately stays on `settings` where it already
works; this table is additive and touches nothing existing.

Also records how each KOT's printing actually went, so a ticket that failed to print stays
visible and retryable instead of silently vanishing.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5b1d84c2f70'
down_revision: Union[str, Sequence[str], None] = 'd4c9e7f13a58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'printer_configurations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False, server_default='kot'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('printer_name', sa.String(length=255), nullable=True),
        sa.Column('connection_type', sa.String(length=20), nullable=False, server_default='usb'),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('port', sa.Integer(), nullable=True),
        sa.Column('usb_device_id', sa.String(length=255), nullable=True),
        sa.Column('bluetooth_device_id', sa.String(length=255), nullable=True),
        sa.Column('paper_width', sa.String(length=10), nullable=False, server_default='80mm'),
        sa.Column('copies', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('auto_print', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('ticket_fields', sa.JSON(), nullable=True),
        sa.Column('category_id', sa.String(length=36), nullable=True),
        sa.Column('connection_status', sa.String(length=20), nullable=False, server_default='unconfigured'),
        sa.Column('last_tested_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_test_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'role', name='uq_printer_configurations_tenant_role'),
    )
    op.create_index(op.f('ix_printer_configurations_tenant_id'), 'printer_configurations', ['tenant_id'])
    op.create_index(op.f('ix_printer_configurations_role'), 'printer_configurations', ['role'])

    # A KOT that failed to print must stay visible and retryable — losing the ticket means the
    # kitchen never learns about the food.
    op.add_column('kots', sa.Column('print_status', sa.String(length=20), nullable=False, server_default='pending'))
    op.add_column('kots', sa.Column('last_print_error', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('kots', 'last_print_error')
    op.drop_column('kots', 'print_status')
    op.drop_index(op.f('ix_printer_configurations_role'), table_name='printer_configurations')
    op.drop_index(op.f('ix_printer_configurations_tenant_id'), table_name='printer_configurations')
    op.drop_table('printer_configurations')
