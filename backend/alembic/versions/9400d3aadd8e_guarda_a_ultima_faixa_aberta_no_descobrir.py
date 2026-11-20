"""guarda a ultima faixa aberta no descobrir

Revision ID: 9400d3aadd8e
Revises: 5d1e8a7c2b90

Esta migração já teve o id 1a232c12c8a4, primeiro com uma tabela last_bands e
depois com a coluna girls.last_band. O id mudou para um banco que rodou alguma
das versões antigas não seguir em frente calado: o Alembic avisa que não
conhece 1a232c12c8a4. Num banco desses, desça até 5d1e8a7c2b90 com o código
antigo, ou, se ele já tem a coluna girls.last_band (e não a tabela),
`alembic stamp 9400d3aadd8e`.

Create Date: 2026-11-19 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9400d3aadd8e"
down_revision: str | Sequence[str] | None = "5d1e8a7c2b90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# O tipo já existe: foi criado com curated_items (49c9c3b49682).
effort_band = postgresql.ENUM(
    "PRIMEIROS_PASSOS",
    "UMA_TARDE",
    "NO_MEU_RITMO",
    "ROLE_COM_A_GALERA",
    "GRANDE_DESAFIO",
    name="effortband",
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("girls", sa.Column("last_band", effort_band, nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # O tipo effortband fica: curated_items ainda usa.
    op.drop_column("girls", "last_band")
