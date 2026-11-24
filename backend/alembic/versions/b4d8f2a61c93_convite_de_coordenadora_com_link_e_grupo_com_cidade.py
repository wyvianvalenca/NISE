"""convite de coordenadora com link e grupo com cidade

Revision ID: b4d8f2a61c93
Revises: a7c3e91d2f40
Create Date: 2026-11-24 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4d8f2a61c93"
down_revision: str | Sequence[str] | None = "a7c3e91d2f40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # O grupo ganha a cidade (D-120): o que não pode repetir é o nome na mesma
    # cidade, não mais o nome sozinho.
    op.add_column("groups", sa.Column("city_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_groups_city_id"), "groups", ["city_id"], unique=False)
    op.create_foreign_key(
        "groups_city_id_fkey", "groups", "cities", ["city_id"], ["id"]
    )
    op.drop_constraint("groups_name_key", "groups", type_="unique")
    op.create_unique_constraint(
        "groups_name_city_id_key", "groups", ["name", "city_id"]
    )

    # O link do convite (RNF-S2.02). Convites que já existem (só de teste) ficam
    # com um hash aleatório, que nenhum link abre.
    op.add_column(
        "coordinator_invites", sa.Column("token_hash", sa.String(), nullable=True)
    )
    op.execute(
        "UPDATE coordinator_invites SET token_hash = "
        "encode(sha256(convert_to(random()::text || id::text, 'UTF8')), 'hex')"
    )
    op.alter_column("coordinator_invites", "token_hash", nullable=False)
    op.create_unique_constraint(
        "coordinator_invites_token_hash_key", "coordinator_invites", ["token_hash"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "coordinator_invites_token_hash_key", "coordinator_invites", type_="unique"
    )
    op.drop_column("coordinator_invites", "token_hash")

    op.drop_constraint("groups_name_city_id_key", "groups", type_="unique")
    op.create_unique_constraint("groups_name_key", "groups", ["name"])
    op.drop_constraint("groups_city_id_fkey", "groups", type_="foreignkey")
    op.drop_index(op.f("ix_groups_city_id"), table_name="groups")
    op.drop_column("groups", "city_id")
