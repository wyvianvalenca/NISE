"""guarda o modelo da exportacao

Revision ID: c9e5a3b72d44
Revises: b8d4f2a61c33
Create Date: 2026-11-23 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9e5a3b72d44"
down_revision: str | Sequence[str] | None = "b8d4f2a61c33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("data_exports", sa.Column("model", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("data_exports", "model")
