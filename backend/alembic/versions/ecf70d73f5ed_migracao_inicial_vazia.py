"""migracao inicial vazia

Revision ID: ecf70d73f5ed
Revises:
Create Date: 2026-11-02 02:28:07.294893

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "ecf70d73f5ed"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
