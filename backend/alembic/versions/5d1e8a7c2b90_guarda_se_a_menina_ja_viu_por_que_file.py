"""guarda se a menina ja viu por que file

Revision ID: 5d1e8a7c2b90
Revises: 3699229ffafe
Create Date: 2026-11-19 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5d1e8a7c2b90"
down_revision: str | Sequence[str] | None = "3699229ffafe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Quem já tem conta começa sem ter visto: a explicação aparece na próxima
    # vez que ela abrir o filé.
    op.add_column(
        "girls",
        sa.Column(
            "file_intro_seen",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("girls", "file_intro_seen")
