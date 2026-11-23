"""guarda o lembrete do evento

Revision ID: 9b64d0c95ca1
Revises: 64f2db8fec9a
Create Date: 2026-11-21 02:04:19.943017

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9b64d0c95ca1"
down_revision: str | Sequence[str] | None = "64f2db8fec9a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "file_entries",
        sa.Column(
            "reminder", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.add_column(
        "file_entries", sa.Column("reminder_sent_for", sa.Date(), nullable=True)
    )
    op.create_check_constraint(
        "ck_file_entries_reminder_only_when_signed_up",
        "file_entries",
        "status = 'SIGNED_UP' OR reminder = false",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_file_entries_reminder_only_when_signed_up",
        "file_entries",
        type_="check",
    )
    op.drop_column("file_entries", "reminder_sent_for")
    op.drop_column("file_entries", "reminder")
