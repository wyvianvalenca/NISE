"""guarda quando o item entrou no file

Revision ID: 93d345b49143
Revises: 7398c6eef660
Create Date: 2026-11-23 21:09:35.438703

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "93d345b49143"
down_revision: str | Sequence[str] | None = "7398c6eef660"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "file_entries",
        sa.Column("filed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    # As linhas que já existem: o melhor palpite é a hora em que a linha foi
    # criada. Vale para quem está no filé e para o "Não deu", que já esteve
    # nele (era uma inscrição). O "Ver depois" e o "Não é pra mim" ficam vazios.
    # Compara como texto: num banco novo, o DID_NOT_GO entra no enum na mesma
    # transação, e o Postgres não deixa usar um valor novo do enum antes do
    # commit.
    op.execute(
        "UPDATE file_entries SET filed_at = created_at"
        " WHERE status::text IN ('NEXT', 'IN_PROGRESS', 'CONCLUDED', 'SIGNED_UP',"
        " 'DID_NOT_GO')"
    )
    op.create_check_constraint(
        "ck_file_entries_filed_at_when_in_file",
        "file_entries",
        "status NOT IN ('NEXT', 'IN_PROGRESS', 'CONCLUDED', 'SIGNED_UP')"
        " OR filed_at IS NOT NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_file_entries_filed_at_when_in_file", "file_entries", type_="check"
    )
    op.drop_column("file_entries", "filed_at")
