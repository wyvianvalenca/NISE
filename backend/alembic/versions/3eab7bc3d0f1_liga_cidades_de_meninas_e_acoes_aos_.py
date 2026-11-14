"""liga cidades de meninas e acoes aos municipios do ibge

Revision ID: 3eab7bc3d0f1
Revises: 50e43b2e6929
Create Date: 2026-11-14 10:59:39.632883

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3eab7bc3d0f1"
down_revision: str | Sequence[str] | None = "50e43b2e6929"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # O #48 criou as colunas sem chave estrangeira, à espera da tabela cities.
    # Os nomes são os que o Postgres daria, para o downgrade saber o que apagar.
    op.create_foreign_key(
        "actions_city_ibge_code_fkey",
        "actions",
        "cities",
        ["city_ibge_code"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "girls_city_ibge_code_fkey",
        "girls",
        "cities",
        ["city_ibge_code"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("girls_city_ibge_code_fkey", "girls", type_="foreignkey")
    op.drop_constraint("actions_city_ibge_code_fkey", "actions", type_="foreignkey")
