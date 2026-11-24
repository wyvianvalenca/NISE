"""continua no curso no acompanhamento

Revision ID: 51af39d18c76
Revises: 3dd92ae069af
Create Date: 2026-11-22 17:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "51af39d18c76"
down_revision: str | Sequence[str] | None = "3dd92ae069af"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

still_enrolled = sa.Enum("YES", "CHANGED", "STOPPED", name="stillenrolled")


def upgrade() -> None:
    """Upgrade schema. Só expande: uma coluna nova, vazia."""
    # O add_column não cria o tipo enum sozinho.
    still_enrolled.create(op.get_bind())
    op.add_column(
        "followup_answers",
        sa.Column("still_enrolled", still_enrolled, nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("followup_answers", "still_enrolled")
    still_enrolled.drop(op.get_bind())
