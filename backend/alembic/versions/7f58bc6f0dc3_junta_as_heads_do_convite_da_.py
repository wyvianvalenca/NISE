"""junta as heads do convite da coordenadora e da exportacao

Revision ID: 7f58bc6f0dc3
Revises: 07b9be5d51dd, 947c08e68148
Create Date: 2026-11-25 01:33:00.908018

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "7f58bc6f0dc3"
down_revision: str | Sequence[str] | None = ("07b9be5d51dd", "947c08e68148")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
