"""antes de começar no cadastro

Revision ID: ea1589d6bece
Revises: d8a4c2e61f57
Create Date: 2026-11-25 18:00:00.000000

As perguntas 1 e 2 do questionário (#293) respondidas no cadastro, na A05a
"Antes de começar" (RF-F10.26, D-64, #303). Duas colunas novas e vazias em
`girls`, com os tipos enum que o questionário já criou.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ea1589d6bece"
down_revision: str | Sequence[str] | None = "d8a4c2e61f57"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Os tipos já existem (66dedafe4272, respostas do acompanhamento). O
# add_column não cria tipo enum, então não há o que criar nem apagar aqui.
computing_view = sa.Enum(
    "WANT_TO_FOLLOW",
    "LIKE_BUT_UNSURE",
    "LESS_INTERESTED",
    "NOT_FOR_ME",
    name="computingview",
)
future_self = sa.Enum("SURE", "MAYBE", "PROBABLY_NOT", name="futureself")


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "girls",
        sa.Column("signup_computing_view", computing_view, nullable=True),
    )
    op.add_column(
        "girls",
        sa.Column("signup_future_self", future_self, nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("girls", "signup_future_self")
    op.drop_column("girls", "signup_computing_view")
