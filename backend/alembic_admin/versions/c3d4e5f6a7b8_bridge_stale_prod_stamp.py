"""bridge stale production stamp

Revision ID: c3d4e5f6a7b8
Revises: 98d0de5b3882
Create Date: 2026-08-09 00:00:01.000000

No-op bridge revision. The production admin database's alembic_version_admin
table ended up stamped at this exact revision id, which was never committed
to this repo -- almost certainly written by an `alembic -c alembic_admin.ini
stamp head` run earlier in development against a draft of the
add_trial_reminder_log migration, before that migration was finalized and
committed under a different (regenerated) revision id, c47a9e2f3b81. `stamp`
only writes the version pointer; it never runs any DDL, so trial_reminder_log
was never actually created in production despite the stamp.

Without this file, `alembic upgrade head` fails outright with
"Can't locate revision identified by 'c3d4e5f6a7b8'" -- it can't even resolve
the migration graph from where production says it is, so no migration in the
chain past this point ever runs (this is the second half of the 2026-08-09
production incident, alongside the concurrent-migration threading bug fixed
in app/core/migrate.py). This revision just gives Alembic a known, real node
matching the stale stamp, forwarding to c47a9e2f3b81 (see its
down_revision), which then actually creates the table.
"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = '98d0de5b3882'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op: exists only to give the stale production stamp a real node to resolve."""
    pass


def downgrade() -> None:
    """No-op: see upgrade()."""
    pass
