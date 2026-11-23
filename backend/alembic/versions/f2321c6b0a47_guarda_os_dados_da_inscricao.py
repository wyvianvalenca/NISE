"""guarda os dados da inscricao

Revision ID: f2321c6b0a47
Revises: 51af39d18c76
Create Date: 2026-11-22 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2321c6b0a47"
down_revision: str | Sequence[str] | None = "51af39d18c76"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The type already exists (it came with girls), so the column points at it.
study_stage = postgresql.ENUM(
    "FUNDAMENTAL",
    "MEDIO",
    "TECNICO",
    "GRADUACAO",
    "FORMADA",
    name="studystage",
    create_type=False,
)


def upgrade() -> None:
    op.add_column("participations", sa.Column("name", sa.String(), nullable=True))
    op.add_column("participations", sa.Column("whatsapp", sa.String(), nullable=True))
    op.add_column(
        "participations", sa.Column("study_stage", study_stage, nullable=True)
    )
    op.add_column(
        "participations", sa.Column("school_year", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("participations", "school_year")
    op.drop_column("participations", "study_stage")
    op.drop_column("participations", "whatsapp")
    op.drop_column("participations", "name")
