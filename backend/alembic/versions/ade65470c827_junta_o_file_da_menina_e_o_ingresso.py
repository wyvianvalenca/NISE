"""junta o file da menina e o ingresso

Revision ID: ade65470c827
Revises: a465074130bc, b4723f18123f
Create Date: 2026-11-21 00:17:53.850464

As duas cadeias saem de a208f1e1d0c4: a do filé da menina (épico #78) e a do
ingresso e das listas oficiais (#270, #273), que entrou na develop antes. Esta
revisão só junta as duas numa head, sem mudar o banco. Trocar o down_revision de
uma delas quebraria os bancos que já rodaram a outra ordem.
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "ade65470c827"
down_revision: str | Sequence[str] | None = ("a465074130bc", "b4723f18123f")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
