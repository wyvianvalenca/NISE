from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin


class Group(TimestampMixin, Base):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(unique=True)


class GroupCoordinator(Base):
    """Liga uma coordenadora a um grupo. As checagens da RN-14 consultam esta tabela."""

    __tablename__ = "group_coordinators"
    __table_args__ = (UniqueConstraint("group_id", "user_id"),)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )


class Invite(Base):
    """Link de convite de um grupo para criar conta (A01b, #51).

    Por enquanto é um convite por grupo, que várias meninas podem usar até
    vencer. O convite por menina, enviado depois da presença (RF-F4.01,
    RN-29), vem com a F4. Quem cria conta pelo link fica com o grupo como
    origem (Girl.origin_group_id).

    O código não é segredo: o grupo divulga o link, e ele só mostra o nome do
    grupo. Por isso fica gravado como está, e o script pode mostrá-lo de novo.
    """

    __tablename__ = "invites"

    # unique=True já cria o índice usado na busca pelo código.
    code: Mapped[str] = mapped_column(unique=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Assíncrono: carregue com selectinload(Invite.group).
    group: Mapped[Group] = relationship()
