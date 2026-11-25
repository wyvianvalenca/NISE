"""junta a exportacao e a conta excluida

Revision ID: 07b9be5d51dd
Revises: a3c91d5e7b24, b3c63a9bb4f6
Create Date: 2026-11-25 01:20:29.237298

A exportação de dados (F24) e a conta excluída (#394) chegaram ao develop em
paralelo. Esta revisão só junta as duas numa head, sem mudar o banco.
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "07b9be5d51dd"
down_revision: str | Sequence[str] | None = ("a3c91d5e7b24", "b3c63a9bb4f6")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
