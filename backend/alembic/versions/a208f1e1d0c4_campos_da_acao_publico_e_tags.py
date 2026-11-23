"""campos da acao, publico e tags

Revision ID: a208f1e1d0c4
Revises: 6b42559424b2
Create Date: 2026-11-18 11:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a208f1e1d0c4"
down_revision: str | Sequence[str] | None = "6b42559424b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The enum types already exist (they came with girls and girl_topics), so the
# new tables point at them instead of creating them again.
study_stage = postgresql.ENUM(
    "FUNDAMENTAL",
    "MEDIO",
    "TECNICO",
    "GRADUACAO",
    "FORMADA",
    name="studystage",
    create_type=False,
)
topic = postgresql.ENUM(
    "PROGRAMACAO",
    "ROBOTICA",
    "IA",
    "DADOS",
    "CIBERSEGURANCA",
    "JOGOS",
    "SITES",
    "DESIGN",
    name="topic",
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("actions", sa.Column("starts_at_time", sa.Time(), nullable=True))
    op.add_column("actions", sa.Column("ends_at_time", sa.Time(), nullable=True))
    op.add_column("actions", sa.Column("address", sa.String(), nullable=True))
    op.add_column("actions", sa.Column("description", sa.String(), nullable=True))
    op.add_column(
        "actions",
        sa.Column(
            "registrations_open",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )
    op.add_column(
        "actions",
        sa.Column(
            "attendance_registered_at", sa.TIMESTAMP(timezone=True), nullable=True
        ),
    )
    op.create_check_constraint(
        "ck_actions_description_max_length",
        "actions",
        "char_length(description) <= 300",
    )

    op.create_table(
        "action_audiences",
        sa.Column("action_id", sa.Integer(), nullable=False),
        sa.Column("stage", study_stage, nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["action_id"], ["actions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("action_id", "stage"),
    )
    op.create_index(
        op.f("ix_action_audiences_action_id"),
        "action_audiences",
        ["action_id"],
        unique=False,
    )
    op.create_table(
        "action_topics",
        sa.Column("action_id", sa.Integer(), nullable=False),
        sa.Column("topic", topic, nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["action_id"], ["actions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("action_id", "topic"),
    )
    op.create_index(
        op.f("ix_action_topics_action_id"),
        "action_topics",
        ["action_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_action_topics_action_id"), table_name="action_topics")
    op.drop_table("action_topics")
    op.drop_index(op.f("ix_action_audiences_action_id"), table_name="action_audiences")
    op.drop_table("action_audiences")
    op.drop_constraint("ck_actions_description_max_length", "actions", type_="check")
    op.drop_column("actions", "attendance_registered_at")
    op.drop_column("actions", "registrations_open")
    op.drop_column("actions", "description")
    op.drop_column("actions", "address")
    op.drop_column("actions", "ends_at_time")
    op.drop_column("actions", "starts_at_time")
    # studystage and topic stay: girls and girl_topics still use them.
