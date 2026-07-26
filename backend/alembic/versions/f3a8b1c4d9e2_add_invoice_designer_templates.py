"""add invoice designer templates and settings branding fields

Revision ID: f3a8b1c4d9e2
Revises: d227ee9285e0
Create Date: 2026-07-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a8b1c4d9e2'
down_revision: Union[str, Sequence[str], None] = 'd227ee9285e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Settings: business profile / branding fields the Invoice Designer's branding panel edits.
    op.add_column('settings', sa.Column('tagline', sa.String(length=200), nullable=True))
    op.add_column('settings', sa.Column('address_line1', sa.String(length=255), nullable=True))
    op.add_column('settings', sa.Column('address_line2', sa.String(length=255), nullable=True))
    op.add_column('settings', sa.Column('city', sa.String(length=100), nullable=True))
    op.add_column('settings', sa.Column('state', sa.String(length=100), nullable=True))
    op.add_column('settings', sa.Column('pincode', sa.String(length=20), nullable=True))
    op.add_column('settings', sa.Column('website', sa.String(length=255), nullable=True))
    op.add_column('settings', sa.Column('pan_number', sa.String(length=20), nullable=True))
    op.add_column('settings', sa.Column('fssai_number', sa.String(length=30), nullable=True))
    op.add_column('settings', sa.Column('drug_license_number', sa.String(length=30), nullable=True))
    op.add_column('settings', sa.Column('msme_udyam_number', sa.String(length=30), nullable=True))
    op.add_column('settings', sa.Column('social_links', sa.JSON(), nullable=True))
    op.add_column('settings', sa.Column('feedback_url', sa.String(length=255), nullable=True))

    op.create_table(
        'invoice_templates',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tenant_id', sa.String(length=36), nullable=False),
        sa.Column('document_type', sa.String(length=30), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_invoice_templates_tenant_id'), 'invoice_templates', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_invoice_templates_document_type'), 'invoice_templates', ['document_type'], unique=False)
    op.create_index(
        'ix_invoice_templates_tenant_doctype', 'invoice_templates', ['tenant_id', 'document_type'], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_invoice_templates_tenant_doctype', table_name='invoice_templates')
    op.drop_index(op.f('ix_invoice_templates_document_type'), table_name='invoice_templates')
    op.drop_index(op.f('ix_invoice_templates_tenant_id'), table_name='invoice_templates')
    op.drop_table('invoice_templates')

    op.drop_column('settings', 'feedback_url')
    op.drop_column('settings', 'social_links')
    op.drop_column('settings', 'msme_udyam_number')
    op.drop_column('settings', 'drug_license_number')
    op.drop_column('settings', 'fssai_number')
    op.drop_column('settings', 'pan_number')
    op.drop_column('settings', 'website')
    op.drop_column('settings', 'pincode')
    op.drop_column('settings', 'state')
    op.drop_column('settings', 'city')
    op.drop_column('settings', 'address_line1')
    op.drop_column('settings', 'address_line2')
    op.drop_column('settings', 'tagline')
