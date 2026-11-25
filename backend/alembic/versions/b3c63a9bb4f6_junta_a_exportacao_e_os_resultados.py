"""junta a exportacao e os resultados

Revision ID: b3c63a9bb4f6
Revises: 93d345b49143, ffd15b0f1d4e
Create Date: 2026-11-25 02:55:08.660825

A exportação de dados (F24) e o carimbo de quando o item entrou no file (#423)
saem de 7398c6eef660. Esta revisão só junta as duas numa head, sem mudar o
banco.
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "b3c63a9bb4f6"
down_revision: str | Sequence[str] | None = ("93d345b49143", "ffd15b0f1d4e")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
