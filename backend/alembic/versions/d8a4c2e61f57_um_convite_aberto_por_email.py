"""um convite de coordenadora aberto por e-mail

Revision ID: d8a4c2e61f57
Revises: 7f58bc6f0dc3
Create Date: 2026-11-25 12:00:00.000000

Um e-mail tem no máximo um convite aberto (nem aceito, nem cancelado), vencido
ou não (RN-35, #446). Antes do índice, a migração fecha (`cancelled_at`) os
convites abertos que sobram: os de e-mail que já tem conta e, por e-mail, todos
menos o de link mais recente (o maior `expires_at`, que é o último enviado,
mesmo por "Reenviar"). Fechar é o mesmo que cancelar: some da lista e o link
responde "invite_not_found".
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d8a4c2e61f57"
down_revision: str | Sequence[str] | None = "7f58bc6f0dc3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "uq_coordinator_invites_open_email"

# O e-mail já tem conta: o convite não serve mais para nada.
CLOSE_INVITES_WITH_ACCOUNT = """
UPDATE coordinator_invites AS ci
SET cancelled_at = now()
WHERE ci.accepted_at IS NULL
  AND ci.cancelled_at IS NULL
  AND EXISTS (SELECT 1 FROM users AS u WHERE u.email = ci.email)
"""

# Fica, por e-mail, só o convite aberto de link mais recente.
CLOSE_OLDER_OPEN_INVITES = """
UPDATE coordinator_invites AS ci
SET cancelled_at = now()
WHERE ci.accepted_at IS NULL
  AND ci.cancelled_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM coordinator_invites AS newer
    WHERE newer.email = ci.email
      AND newer.accepted_at IS NULL
      AND newer.cancelled_at IS NULL
      AND (newer.expires_at, newer.id) > (ci.expires_at, ci.id)
  )
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(sa.text(CLOSE_INVITES_WITH_ACCOUNT))
    op.execute(sa.text(CLOSE_OLDER_OPEN_INVITES))
    op.create_index(
        INDEX,
        "coordinator_invites",
        ["email"],
        unique=True,
        postgresql_where=sa.text("accepted_at IS NULL AND cancelled_at IS NULL"),
    )


def downgrade() -> None:
    """Downgrade schema.

    Só tira o índice. Os convites que o upgrade fechou continuam fechados: não
    há como saber quais eram, e reabri-los voltaria a deixar dois links válidos.
    """
    op.drop_index(INDEX, table_name="coordinator_invites")
