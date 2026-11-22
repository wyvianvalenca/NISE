"""curadoria online nao tem cidade

Revision ID: a465074130bc
Revises: 729aefcf8580
Create Date: 2026-11-20 12:00:00.000000

A regra já estava no arquivo da curadoria (CuratedItemIn); agora o banco também
confere, como já fazia com o presencial sem cidade (revisão da #320).
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a465074130bc"
down_revision: str | Sequence[str] | None = "729aefcf8580"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_check_constraint(
        "ck_curated_items_online_has_no_city",
        "curated_items",
        "format = 'IN_PERSON' OR city_ibge_code IS NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_curated_items_online_has_no_city", "curated_items", type_="check"
    )
