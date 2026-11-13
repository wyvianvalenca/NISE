import enum
from datetime import date

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin


# Os valores são os mesmos códigos que o front usa (frontend/lib/signup.ts).
class Topic(enum.Enum):
    PROGRAMACAO = "programacao"
    ROBOTICA = "robotica"
    IA = "ia"
    DADOS = "dados"
    CIBERSEGURANCA = "ciberseguranca"
    JOGOS = "jogos"
    SITES = "sites"
    DESIGN = "design"


class StudyStage(enum.Enum):
    FUNDAMENTAL = "fundamental"
    MEDIO = "medio"
    TECNICO = "tecnico"
    GRADUACAO = "graduacao"
    FORMADA = "formada"


class Girl(TimestampMixin, Base):
    """Registro da menina e o perfil dela.

    A importação de uma lista cria só este registro, sem conta (RN-27). Quando
    ela cria conta com o mesmo e-mail, `user_id` é preenchido, e o registro
    importado vira o dela, sem duplicar (RF-F2.01, RF-F2.02, RN-29).
    """

    __tablename__ = "girls"

    # Chave para reconhecer a mesma menina em listas de grupos diferentes.
    # Sempre gravado com normalize_email (app/users/service.py).
    email: Mapped[str] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column()
    # Vazio enquanto ela não tem conta. Se a conta for apagada, o registro
    # volta a ser só o importado.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )

    # Perfil. Tudo opcional, porque quem foi importada ainda não preencheu nada.
    # Menores de 13 são barradas no servidor antes de qualquer gravação (RN-03).
    birth_date: Mapped[date | None] = mapped_column()
    # Código do município no IBGE (RN-17). A chave estrangeira vem com a #50.
    city_ibge_code: Mapped[int | None] = mapped_column()
    # Grupo do convite. Vazio quer dizer que ela chegou sozinha (RF-F7.04, RN-04).
    origin_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL")
    )
    # Vazio enquanto ela não respondeu a tela de interesses (RF-F10.01).
    study_stage: Mapped[StudyStage | None] = mapped_column()
    # "Ainda não sei, me mostra de tudo". Nunca vem junto com temas; quem salva
    # o perfil confere isso.
    all_topics: Mapped[bool] = mapped_column(default=False, server_default="false")

    # Assíncrono: carregue com selectinload(Girl.topics).
    topics: Mapped[list["GirlTopic"]] = relationship(cascade="all, delete-orphan")


class GirlTopic(Base):
    """Um tema de interesse da menina. Uma linha por tema."""

    __tablename__ = "girl_topics"
    __table_args__ = (UniqueConstraint("girl_id", "topic"),)

    girl_id: Mapped[int] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), index=True
    )
    topic: Mapped[Topic] = mapped_column()
