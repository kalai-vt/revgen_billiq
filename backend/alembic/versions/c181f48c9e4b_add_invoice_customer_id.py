"""add invoice customer_id

Revision ID: c181f48c9e4b
Revises: bebaaf6bef98
Create Date: 2026-07-23 11:24:37.569651

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c181f48c9e4b'
down_revision: Union[str, Sequence[str], None] = 'bebaaf6bef98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite can't ALTER a table to add an FK constraint without a full table rebuild (batch
    # mode); the column is added without a DB-level constraint, matching how other post-hoc FK
    # columns in this schema (e.g. products.category_id) already work — enforced at the
    # SQLAlchemy/application layer via explicit tenant-scoped queries, not the DB.
    op.add_column('invoices', sa.Column('customer_id', sa.String(length=36), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('invoices', 'customer_id')
