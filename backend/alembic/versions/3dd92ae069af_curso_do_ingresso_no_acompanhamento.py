"""curso do ingresso no acompanhamento

Revision ID: 3dd92ae069af
Revises: 756a66e7ae0e
Create Date: 2026-11-22 16:34:05.716007

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3dd92ae069af"
down_revision: str | Sequence[str] | None = "756a66e7ae0e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

course_status = sa.Enum(
    "TECNICO", "GRADUACAO", "TRYING", "NOT_YET", name="coursestatus"
)


def upgrade() -> None:
    """Upgrade schema.

    Só expande: "Onde?" passa a ser opcional e há uma coluna nova, vazia.
    """
    op.add_column("enrollments", sa.Column("left_on", sa.Date(), nullable=True))
    op.alter_column(
        "enrollments", "institution", existing_type=sa.VARCHAR(), nullable=True
    )
    # O add_column não cria o tipo enum sozinho.
    course_status.create(op.get_bind())
    op.add_column(
        "followup_answers", sa.Column("course_status", course_status, nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("followup_answers", "course_status")
    course_status.drop(op.get_bind())
    # Sem "Onde?" vira texto vazio, que a lista da coordenadora (C8) já mostra
    # como sem instituição: voltar não perde nada.
    op.execute("UPDATE enrollments SET institution = '' WHERE institution IS NULL")
    op.alter_column(
        "enrollments", "institution", existing_type=sa.VARCHAR(), nullable=False
    )
    op.drop_column("enrollments", "left_on")
