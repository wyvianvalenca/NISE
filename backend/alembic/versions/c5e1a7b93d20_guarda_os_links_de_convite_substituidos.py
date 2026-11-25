"""guarda os links de convite substituidos

Revision ID: c5e1a7b93d20
Revises: b4d8f2a61c93
Create Date: 2026-11-24 22:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5e1a7b93d20"
down_revision: str | Sequence[str] | None = "b4d8f2a61c93"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "replaced_invite_links",
        sa.Column("invite_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["invite_id"], ["coordinator_invites.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        op.f("ix_replaced_invite_links_invite_id"),
        "replaced_invite_links",
        ["invite_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_replaced_invite_links_invite_id"), table_name="replaced_invite_links"
    )
    op.drop_table("replaced_invite_links")
