"""guarda o nao deu do evento

Revision ID: 64f2db8fec9a
Revises: f2321c6b0a47
Create Date: 2026-11-21 02:40:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "64f2db8fec9a"
down_revision: str | Sequence[str] | None = "f2321c6b0a47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# O Postgres guarda o nome do membro do enum, não o valor.
OLD_VALUES = "'NEXT', 'IN_PROGRESS', 'CONCLUDED', 'SIGNED_UP', 'LATER', 'DISMISSED'"


def upgrade() -> None:
    """Upgrade schema."""
    # O "Não deu" de um evento de fora depois da data (#190).
    op.execute("ALTER TYPE filestatus ADD VALUE IF NOT EXISTS 'DID_NOT_GO'")


# As restrições que comparam o status. Elas ficam presas ao tipo antigo, então
# saem antes de trocar o tipo e voltam depois.
STATUS_CHECKS = {
    "ck_file_entries_reason_only_when_dismissed": (
        "status = 'DISMISSED' OR dismiss_reason IS NULL"
    ),
    "ck_file_entries_feedback_only_when_concluded": (
        "status = 'CONCLUDED' OR (rating IS NULL AND similar_choice IS NULL)"
    ),
    "ck_file_entries_concluded_on_only_when_concluded": (
        "status = 'CONCLUDED' OR concluded_on IS NULL"
    ),
}


def downgrade() -> None:
    """Downgrade schema."""
    # O Postgres não tira um valor de um enum: o tipo é recriado sem ele. Um
    # "Não deu" volta a ser o que era antes desta versão: a linha apagada.
    op.execute("DELETE FROM file_entries WHERE status = 'DID_NOT_GO'")
    for name in STATUS_CHECKS:
        op.drop_constraint(name, "file_entries", type_="check")
    op.execute("ALTER TYPE filestatus RENAME TO filestatus_old")
    op.execute(f"CREATE TYPE filestatus AS ENUM ({OLD_VALUES})")
    op.execute(
        "ALTER TABLE file_entries ALTER COLUMN status TYPE filestatus"
        " USING status::text::filestatus"
    )
    op.execute("DROP TYPE filestatus_old")
    for name, condition in STATUS_CHECKS.items():
        op.create_check_constraint(name, "file_entries", condition)
