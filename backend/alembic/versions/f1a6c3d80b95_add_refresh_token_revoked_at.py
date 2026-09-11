"""add refresh token revoked_at

Revision ID: f1a6c3d80b95
Revises: e5b1d84c2f70
Create Date: 2026-09-11 05:40:00.000000

Reuse detection invalidated every session for a user as of "now". change_password revokes the old
refresh token itself, so replaying that token once more — a retry, a second tab, another device —
killed the brand-new session the password change had just handed back: the user changed their
password and was immediately signed out.

Recording when a token was revoked lets that invalidation be dated to the revocation instead, so
sessions established afterwards survive while everything older, including a thief's, still dies.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a6c3d80b95'
down_revision: Union[str, Sequence[str], None] = 'e5b1d84c2f70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('refresh_tokens', sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('refresh_tokens', 'revoked_at')
