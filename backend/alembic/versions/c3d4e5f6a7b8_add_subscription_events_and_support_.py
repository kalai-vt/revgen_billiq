"""add subscription events and support tickets

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-07-26 20:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('settings', sa.Column('subscription_status', sa.String(length=20), nullable=False, server_default='active'))
    op.add_column('settings', sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        'subscription_events',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('event_type', sa.String(length=30), nullable=False),
        sa.Column('from_plan', sa.String(length=20), nullable=True),
        sa.Column('to_plan', sa.String(length=20), nullable=True),
        sa.Column('from_status', sa.String(length=20), nullable=True),
        sa.Column('to_status', sa.String(length=20), nullable=True),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('changed_by', sa.String(length=200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_subscription_events_tenant_id', 'subscription_events', ['tenant_id'])
    op.create_index('ix_subscription_events_created_at', 'subscription_events', ['created_at'])

    op.create_table(
        'support_tickets',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('subject', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='open'),
        sa.Column('priority', sa.String(length=20), nullable=False, server_default='medium'),
        sa.Column('created_by_admin_id', sa.String(length=36), nullable=False),
        sa.Column('created_by_admin_name', sa.String(length=200), nullable=False),
        sa.Column('assigned_admin_id', sa.String(length=36), nullable=True),
        sa.Column('assigned_admin_name', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_support_tickets_tenant_id', 'support_tickets', ['tenant_id'])
    op.create_index('ix_support_tickets_status', 'support_tickets', ['status'])
    op.create_index('ix_support_tickets_priority', 'support_tickets', ['priority'])
    op.create_index('ix_support_tickets_created_at', 'support_tickets', ['created_at'])

    op.create_table(
        'support_ticket_messages',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('ticket_id', sa.String(length=36), sa.ForeignKey('support_tickets.id'), nullable=False),
        sa.Column('author_admin_id', sa.String(length=36), nullable=False),
        sa.Column('author_name', sa.String(length=200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_support_ticket_messages_ticket_id', 'support_ticket_messages', ['ticket_id'])
    op.create_index('ix_support_ticket_messages_created_at', 'support_ticket_messages', ['created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_support_ticket_messages_created_at', table_name='support_ticket_messages')
    op.drop_index('ix_support_ticket_messages_ticket_id', table_name='support_ticket_messages')
    op.drop_table('support_ticket_messages')

    op.drop_index('ix_support_tickets_created_at', table_name='support_tickets')
    op.drop_index('ix_support_tickets_priority', table_name='support_tickets')
    op.drop_index('ix_support_tickets_status', table_name='support_tickets')
    op.drop_index('ix_support_tickets_tenant_id', table_name='support_tickets')
    op.drop_table('support_tickets')

    op.drop_index('ix_subscription_events_created_at', table_name='subscription_events')
    op.drop_index('ix_subscription_events_tenant_id', table_name='subscription_events')
    op.drop_table('subscription_events')

    op.drop_column('settings', 'trial_ends_at')
    op.drop_column('settings', 'subscription_status')
