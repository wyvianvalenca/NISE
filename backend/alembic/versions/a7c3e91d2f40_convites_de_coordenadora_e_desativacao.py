"""convites de coordenadora e desativacao

Revision ID: a7c3e91d2f40
Revises: 7398c6eef660
Create Date: 2026-11-24 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c3e91d2f40"
down_revision: str | Sequence[str] | None = "7398c6eef660"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "coordinator_invites",
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_coordinator_invites_email"),
        "coordinator_invites",
        ["email"],
        unique=False,
    )
    op.create_index(
        op.f("ix_coordinator_invites_group_id"),
        "coordinator_invites",
        ["group_id"],
        unique=False,
    )
    op.add_column(
        "users",
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "deactivated_at")
    op.drop_index(
        op.f("ix_coordinator_invites_group_id"), table_name="coordinator_invites"
    )
    op.drop_index(
        op.f("ix_coordinator_invites_email"), table_name="coordinator_invites"
    )
    op.drop_table("coordinator_invites")
