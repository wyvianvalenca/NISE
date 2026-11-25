"""junta as heads do convite da coordenadora e do file

Revision ID: e3d4e9892d3f
Revises: 93d345b49143, c5e1a7b93d20
Create Date: 2026-11-25 00:08:22.451305

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "e3d4e9892d3f"
down_revision: str | Sequence[str] | None = ("93d345b49143", "c5e1a7b93d20")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
