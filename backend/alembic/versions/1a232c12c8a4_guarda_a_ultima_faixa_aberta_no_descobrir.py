"""guarda a ultima faixa aberta no descobrir

Revision ID: 1a232c12c8a4
Revises: 5d1e8a7c2b90
Create Date: 2026-11-19 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1a232c12c8a4"
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
