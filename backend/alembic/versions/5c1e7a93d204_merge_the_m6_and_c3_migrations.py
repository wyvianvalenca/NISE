"""merge the M6 and C3 migrations

Revision ID: 5c1e7a93d204
Revises: 9b64d0c95ca1, da004b57a906
Create Date: 2026-11-22 10:00:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "5c1e7a93d204"
down_revision: str | Sequence[str] | None = ("9b64d0c95ca1", "da004b57a906")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
