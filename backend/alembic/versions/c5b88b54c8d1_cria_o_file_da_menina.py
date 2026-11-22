"""cria o file da menina

Revision ID: c5b88b54c8d1
Revises: 49c9c3b49682
Create Date: 2026-11-19 00:48:58.748287

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5b88b54c8d1"
down_revision: str | Sequence[str] | None = "49c9c3b49682"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "file_entries",
        sa.Column("girl_id", sa.Integer(), nullable=False),
        sa.Column("curated_item_id", sa.Integer(), nullable=True),
        sa.Column("action_id", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "NEXT",
                "IN_PROGRESS",
                "CONCLUDED",
                "SIGNED_UP",
                "LATER",
                "DISMISSED",
                name="filestatus",
            ),
            nullable=False,
        ),
        sa.Column(
            "dismiss_reason",
            sa.Enum(
                "JA_CONHECO",
                "MUITO_DIFICIL",
                "MUITO_FACIL",
                "NAO_CURTO_O_TEMA",
                "SEM_TEMPO_AGORA",
                "OUTRO_MOTIVO",
                name="dismissreason",
            ),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status = 'DISMISSED' OR dismiss_reason IS NULL",
            name="ck_file_entries_reason_only_when_dismissed",
        ),
        sa.CheckConstraint(
            "num_nonnulls(curated_item_id, action_id) = 1",
            name="ck_file_entries_one_source",
        ),
        sa.ForeignKeyConstraint(["action_id"], ["actions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["curated_item_id"], ["curated_items.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["girl_id"], ["girls.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("girl_id", "action_id"),
        sa.UniqueConstraint("girl_id", "curated_item_id"),
    )
    op.create_index(
        op.f("ix_file_entries_action_id"), "file_entries", ["action_id"], unique=False
    )
    op.create_index(
        op.f("ix_file_entries_curated_item_id"),
        "file_entries",
        ["curated_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_file_entries_girl_id"), "file_entries", ["girl_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_file_entries_girl_id"), table_name="file_entries")
    op.drop_index(op.f("ix_file_entries_curated_item_id"), table_name="file_entries")
    op.drop_index(op.f("ix_file_entries_action_id"), table_name="file_entries")
    op.drop_table("file_entries")
    # O drop_table não apaga os tipos enum do Postgres; sem isto, subir de novo falha.
    for enum_name in ("filestatus", "dismissreason"):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
