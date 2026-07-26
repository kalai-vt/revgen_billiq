"""add invite tokens, notifications, and communications

Revision ID: b2c3d4e5f6a7
Revises: f23c8f44868f
Create Date: 2026-07-26 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'f23c8f44868f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('admin_users', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('admin_users', sa.Column('invited_by_admin_id', sa.String(length=36), nullable=True))

    op.create_table(
        'admin_invite_tokens',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('admin_user_id', sa.String(length=36), sa.ForeignKey('admin_users.id'), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_admin_invite_tokens_admin_user_id', 'admin_invite_tokens', ['admin_user_id'])
    op.create_index('ix_admin_invite_tokens_token_hash', 'admin_invite_tokens', ['token_hash'], unique=True)

    op.create_table(
        'admin_notifications',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('dedup_key', sa.String(length=150), nullable=False),
        sa.Column('type', sa.String(length=40), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False, server_default='info'),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('message', sa.String(length=500), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_admin_notifications_dedup_key', 'admin_notifications', ['dedup_key'], unique=True)
    op.create_index('ix_admin_notifications_type', 'admin_notifications', ['type'])
    op.create_index('ix_admin_notifications_tenant_id', 'admin_notifications', ['tenant_id'])
    op.create_index('ix_admin_notifications_created_at', 'admin_notifications', ['created_at'])

    op.create_table(
        'admin_notification_reads',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('notification_id', sa.String(length=36), sa.ForeignKey('admin_notifications.id'), nullable=False),
        sa.Column('admin_user_id', sa.String(length=36), sa.ForeignKey('admin_users.id'), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_admin_notification_reads_notification_id', 'admin_notification_reads', ['notification_id'])
    op.create_index('ix_admin_notification_reads_admin_user_id', 'admin_notification_reads', ['admin_user_id'])

    op.create_table(
        'admin_communications',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('admin_user_id', sa.String(length=36), nullable=False),
        sa.Column('admin_user_name', sa.String(length=200), nullable=False),
        sa.Column('subject', sa.String(length=200), nullable=False),
        sa.Column('message', sa.String(length=4000), nullable=False),
        sa.Column('audience_type', sa.String(length=20), nullable=False),
        sa.Column('audience_filter', sa.JSON(), nullable=True),
        sa.Column('recipient_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_admin_communications_admin_user_id', 'admin_communications', ['admin_user_id'])
    op.create_index('ix_admin_communications_created_at', 'admin_communications', ['created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_admin_communications_created_at', table_name='admin_communications')
    op.drop_index('ix_admin_communications_admin_user_id', table_name='admin_communications')
    op.drop_table('admin_communications')

    op.drop_index('ix_admin_notification_reads_admin_user_id', table_name='admin_notification_reads')
    op.drop_index('ix_admin_notification_reads_notification_id', table_name='admin_notification_reads')
    op.drop_table('admin_notification_reads')

    op.drop_index('ix_admin_notifications_created_at', table_name='admin_notifications')
    op.drop_index('ix_admin_notifications_tenant_id', table_name='admin_notifications')
    op.drop_index('ix_admin_notifications_type', table_name='admin_notifications')
    op.drop_index('ix_admin_notifications_dedup_key', table_name='admin_notifications')
    op.drop_table('admin_notifications')

    op.drop_index('ix_admin_invite_tokens_token_hash', table_name='admin_invite_tokens')
    op.drop_index('ix_admin_invite_tokens_admin_user_id', table_name='admin_invite_tokens')
    op.drop_table('admin_invite_tokens')

    op.drop_column('admin_users', 'invited_by_admin_id')
    op.drop_column('admin_users', 'must_change_password')
