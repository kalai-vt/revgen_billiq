"""add billiq promotion config, events, and tenant tracking id

Revision ID: 8cf8f04e8798
Revises: 1f35cba54958
Create Date: 2026-08-10 23:10:00.000000

"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8cf8f04e8798'
down_revision: Union[str, Sequence[str], None] = '1f35cba54958'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PROMOTION_DEFAULTS = {
    "id": "default",
    "version": "1.0",
    "title": "Powered by RevGenAI BillIQ",
    "description": "Smart Billing • Inventory • Analytics",
    "website": "revgenai.in/billiq",
    "phone": "8680844026",
    "cta_text": "Want BillIQ for your business? Scan to learn more",
}


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite has no ALTER-based ADD CONSTRAINT, so this needs batch mode (which recreates the
    # table); on Postgres batch mode just issues a plain ALTER TABLE ADD CONSTRAINT.
    with op.batch_alter_table('tenants') as batch_op:
        batch_op.add_column(sa.Column('promotion_tracking_id', sa.String(length=32), nullable=True))
        batch_op.create_unique_constraint('uq_tenants_promotion_tracking_id', ['promotion_tracking_id'])

    op.create_table(
        'promotion_configs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('version', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=200), nullable=False),
        sa.Column('website', sa.String(length=200), nullable=False),
        sa.Column('phone', sa.String(length=50), nullable=False),
        sa.Column('cta_text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'promotion_events',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.String(length=30), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_promotion_events_event_type'), 'promotion_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_promotion_events_tenant_id'), 'promotion_events', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_promotion_events_created_at'), 'promotion_events', ['created_at'], unique=False)

    now = datetime.now(timezone.utc)
    promotion_configs = sa.table(
        'promotion_configs',
        sa.column('id', sa.String),
        sa.column('version', sa.String),
        sa.column('title', sa.String),
        sa.column('description', sa.String),
        sa.column('website', sa.String),
        sa.column('phone', sa.String),
        sa.column('cta_text', sa.Text),
        sa.column('created_at', sa.DateTime),
        sa.column('updated_at', sa.DateTime),
    )
    op.bulk_insert(
        promotion_configs,
        [
            {
                **PROMOTION_DEFAULTS,
                "created_at": now,
                "updated_at": now,
            }
        ],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_promotion_events_created_at'), table_name='promotion_events')
    op.drop_index(op.f('ix_promotion_events_tenant_id'), table_name='promotion_events')
    op.drop_index(op.f('ix_promotion_events_event_type'), table_name='promotion_events')
    op.drop_table('promotion_events')
    op.drop_table('promotion_configs')
    with op.batch_alter_table('tenants') as batch_op:
        batch_op.drop_constraint('uq_tenants_promotion_tracking_id', type_='unique')
        batch_op.drop_column('promotion_tracking_id')
