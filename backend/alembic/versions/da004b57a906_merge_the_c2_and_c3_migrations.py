"""merge the C2 and C3 migrations

Revision ID: da004b57a906
Revises: f2321c6b0a47, 7398c6eef660
Create Date: 2026-11-22 09:00:12.077102

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "da004b57a906"
down_revision: str | Sequence[str] | None = ("f2321c6b0a47", "7398c6eef660")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
