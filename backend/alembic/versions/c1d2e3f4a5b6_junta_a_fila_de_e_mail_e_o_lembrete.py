"""junta a fila de e-mail do indicio e o lembrete do evento

Revision ID: c1d2e3f4a5b6
Revises: 888e73d5d48a, 9b64d0c95ca1
Create Date: 2026-11-22 09:00:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: str | Sequence[str] | None = ("888e73d5d48a", "9b64d0c95ca1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Só junta as duas linhas de migração: não muda o banco."""


def downgrade() -> None:
    """Só separa as duas linhas de migração: não muda o banco."""
