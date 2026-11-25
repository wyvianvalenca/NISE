"""guarda o recorte da exportacao

Revision ID: b8d4f2a61c33
Revises: a7c3e1d92b40
Create Date: 2026-11-23 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8d4f2a61c33"
down_revision: str | Sequence[str] | None = "a7c3e1d92b40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "data_exports",
        sa.Column("cut", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("data_exports", "cut")
