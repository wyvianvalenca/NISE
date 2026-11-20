"""guarda o dia em que a atividade foi concluida

Revision ID: 729aefcf8580
Revises: 9400d3aadd8e
Create Date: 2026-11-19 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "729aefcf8580"
down_revision: str | Sequence[str] | None = "9400d3aadd8e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("file_entries", sa.Column("concluded_on", sa.Date(), nullable=True))
    op.create_check_constraint(
        "ck_file_entries_concluded_on_only_when_concluded",
        "file_entries",
        "status = 'CONCLUDED' OR concluded_on IS NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_file_entries_concluded_on_only_when_concluded",
        "file_entries",
        type_="check",
    )
    op.drop_column("file_entries", "concluded_on")
