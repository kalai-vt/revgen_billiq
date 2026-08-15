"""add print agent pairing codes, devices, and jobs

Revision ID: 56b6c7cc51ea
Revises: f7a1c8e5b3d0
Create Date: 2026-08-15 08:50:18.322966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '56b6c7cc51ea'
down_revision: Union[str, Sequence[str], None] = 'f7a1c8e5b3d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'pairing_codes',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('code', sa.String(length=10), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_user_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pairing_codes_tenant_id'), 'pairing_codes', ['tenant_id'])
    op.create_index(op.f('ix_pairing_codes_code'), 'pairing_codes', ['code'])

    op.create_table(
        'print_agent_devices',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('platform', sa.String(length=20), nullable=False),
        sa.Column('agent_version', sa.String(length=50), nullable=False),
        sa.Column('device_fingerprint', sa.String(length=255), nullable=True),
        sa.Column('secret_hash', sa.String(length=64), nullable=False),
        sa.Column('paired_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_print_agent_devices_tenant_id'), 'print_agent_devices', ['tenant_id'])

    op.create_table(
        'print_jobs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('device_id', sa.String(length=36), nullable=False),
        sa.Column('printer_id', sa.String(length=255), nullable=False),
        sa.Column('document_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('error_code', sa.String(length=100), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['device_id'], ['print_agent_devices.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_print_jobs_tenant_id'), 'print_jobs', ['tenant_id'])
    op.create_index(op.f('ix_print_jobs_device_id'), 'print_jobs', ['device_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_print_jobs_device_id'), table_name='print_jobs')
    op.drop_index(op.f('ix_print_jobs_tenant_id'), table_name='print_jobs')
    op.drop_table('print_jobs')

    op.drop_index(op.f('ix_print_agent_devices_tenant_id'), table_name='print_agent_devices')
    op.drop_table('print_agent_devices')

    op.drop_index(op.f('ix_pairing_codes_code'), table_name='pairing_codes')
    op.drop_index(op.f('ix_pairing_codes_tenant_id'), table_name='pairing_codes')
    op.drop_table('pairing_codes')
