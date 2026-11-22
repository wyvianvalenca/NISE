"""guarda avaliacao e sugestoes parecidas no file

Revision ID: 3699229ffafe
Revises: c5b88b54c8d1
Create Date: 2026-11-19 04:03:59.337325

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3699229ffafe"
down_revision: str | Sequence[str] | None = "c5b88b54c8d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

similar_choice = sa.Enum(
    "MAIS_AVANCADO",
    "MESMO_NIVEL",
    "OUTRO_TEMA",
    "POR_ENQUANTO_NAO",
    name="similarchoice",
)


def upgrade() -> None:
    """Upgrade schema."""
    # O add_column não cria o tipo enum no Postgres (só o create_table cria).
    similar_choice.create(op.get_bind(), checkfirst=True)
    op.add_column("file_entries", sa.Column("rating", sa.Integer(), nullable=True))
    op.add_column(
        "file_entries", sa.Column("similar_choice", similar_choice, nullable=True)
    )
    op.create_check_constraint(
        "ck_file_entries_rating_from_1_to_5",
        "file_entries",
        "rating BETWEEN 1 AND 5",
    )
    op.create_check_constraint(
        "ck_file_entries_feedback_only_when_concluded",
        "file_entries",
        "status = 'CONCLUDED' OR (rating IS NULL AND similar_choice IS NULL)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_file_entries_feedback_only_when_concluded", "file_entries", type_="check"
    )
    op.drop_constraint(
        "ck_file_entries_rating_from_1_to_5", "file_entries", type_="check"
    )
    op.drop_column("file_entries", "similar_choice")
    op.drop_column("file_entries", "rating")
    similar_choice.drop(op.get_bind(), checkfirst=True)
