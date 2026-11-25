"""junta as heads do convite da coordenadora e da conta excluida

Revision ID: 947c08e68148
Revises: a3c91d5e7b24, e3d4e9892d3f
Create Date: 2026-11-25 01:19:55.731567

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "947c08e68148"
down_revision: str | Sequence[str] | None = ("a3c91d5e7b24", "e3d4e9892d3f")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
