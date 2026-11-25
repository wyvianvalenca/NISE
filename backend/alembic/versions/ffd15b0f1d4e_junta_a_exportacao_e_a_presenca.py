"""junta a exportacao e a presenca

Revision ID: ffd15b0f1d4e
Revises: 7398c6eef660, c9e5a3b72d44
Create Date: 2026-11-23 21:08:04.817572

As duas cadeias saem de f2321c6b0a47: a da exportação de dados (épico C7, F24)
e a da presença e dos eventos de fora (C3, F4, F10), que entrou na develop
antes. Esta revisão só junta as duas numa head, sem mudar o banco. Trocar o
down_revision de uma delas quebraria os bancos que já rodaram a outra ordem.
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "ffd15b0f1d4e"
down_revision: str | Sequence[str] | None = ("7398c6eef660", "c9e5a3b72d44")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
