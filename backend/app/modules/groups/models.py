from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin
from app.modules.cities.models import City


class Group(TimestampMixin, Base):
    __tablename__ = "groups"
    __table_args__ = (UniqueConstraint("name", "city_id"),)

    name: Mapped[str] = mapped_column()
    # Município do IBGE (RN-17). Vazio nos grupos antigos, criados por script.
    # Não há dois grupos com o mesmo nome e a mesma cidade (D-120).
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"), index=True)

    # Assíncrono: carregue com selectinload(Group.city).
    city: Mapped[City | None] = relationship()


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

    O convite do grupo é um link que várias meninas podem usar até vencer. O
    convite pessoal, enviado por e-mail depois da presença (RF-F4.01, RN-32,
    #348), é uma linha desta mesma tabela com `girl_id`, e abre a mesma tela.
    Quem cria conta pelo link fica com o grupo como origem
    (Girl.origin_group_id).

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
    # The girl of a personal invite, sent by e-mail after the attendance
    # (RF-F4.01, RN-32, #348). Empty for the group's link, which anyone uses.
    # A personal invite lasts 30 days and is not single-use; like the group's
    # link, it only opens the sign-up and gives access to no data.
    girl_id: Mapped[int | None] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), index=True
    )

    # Assíncrono: carregue com selectinload(Invite.group).
    group: Mapped[Group] = relationship()


class CoordinatorInvite(Base):
    """Convite de uma coordenadora para um grupo, enviado pela equipe NISE (D-115).

    Vale 7 dias e só uma vez (aceito em `accepted_at`). A lista do admin mostra
    o convite como "Convite enviado" até `expires_at` e como "Convite expirou"
    depois. Convite aceito vira a coordenadora (GroupCoordinator) e cancelado
    some da lista. Quem cria, reenvia e cancela é a story #453.
    """

    __tablename__ = "coordinator_invites"

    name: Mapped[str] = mapped_column()
    email: Mapped[str] = mapped_column(index=True)
    # SHA-256 do link enviado (RNF-S2.02). O link em si nunca é gravado: quem
    # lê o banco não consegue abrir o convite de ninguém.
    token_hash: Mapped[str] = mapped_column(unique=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Assíncrono: carregue com selectinload(CoordinatorInvite.group).
    group: Mapped[Group] = relationship()
