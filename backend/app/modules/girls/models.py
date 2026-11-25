import enum
from datetime import date

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin
from app.modules.followup.models import ComputingView, FutureSelf


# Os valores são os códigos que a A05 envia e que GET /api/profile/interest-options
# serve (os nomes que aparecem na tela ficam em app/modules/girls/utils.py).
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


# Usada pelo catálogo e por `Girl.last_band`. Fica aqui, e não no catálogo,
# porque o catálogo já importa deste arquivo, e um import de volta seria circular.
class EffortBand(enum.Enum):
    """As 5 faixas de esforço, na ordem da tela Descobrir (RF-F10.03).

    Os valores são os mesmos de `BAND_CODES` no front (frontend/lib/descobrir.ts).
    """

    PRIMEIROS_PASSOS = "primeiros-passos"  # até 15 min
    UMA_TARDE = "uma-tarde"  # até 1 dia, sozinha
    NO_MEU_RITMO = "no-meu-ritmo"  # vários dias, sozinha
    ROLE_COM_A_GALERA = "role-com-a-galera"  # até 1 dia, em grupo
    GRANDE_DESAFIO = "grande-desafio"  # em grupo, mais tempo


# O nome que a coordenadora vê no lugar do de quem excluiu a conta (RF-F7.09,
# #394). Rótulo neutro, sem "exclusão" e sem data (decisão de 24/11/2026).
ANONYMIZED_NAME = "Registro anonimizado"


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
    # Vazio enquanto ela não tem conta. Quem aceitou os termos não tem a linha
    # de users apagada (RESTRICT em terms_acceptances, #49). A exclusão de conta
    # (RF-F7.09, #394) anonimiza a menina e a usuária no lugar e MANTÉM este
    # vínculo, porque os ingressantes (C8) contam quem tem conta; a usuária
    # anonimizada não identifica ninguém. O SET NULL cobre só contas sem aceite.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )

    # Perfil. Tudo opcional, porque quem foi importada ainda não preencheu nada.
    # Menores de 13 são barradas no servidor antes de qualquer gravação (RN-03).
    birth_date: Mapped[date | None] = mapped_column()
    # Código do município no IBGE (RN-17), sempre um dos de `cities` (#50).
    city_ibge_code: Mapped[int | None] = mapped_column(
        ForeignKey("cities.id", ondelete="RESTRICT")
    )
    # Grupo do convite. Vazio quer dizer que ela chegou sozinha (RF-F7.04, RN-04).
    origin_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL")
    )
    # Vazio enquanto ela não respondeu a tela de interesses (RF-F10.01).
    study_stage: Mapped[StudyStage | None] = mapped_column()
    # "Ainda não sei, me mostra de tudo". Nunca vem junto com temas; quem salva
    # o perfil confere isso.
    all_topics: Mapped[bool] = mapped_column(default=False, server_default="false")
    # Ela já viu "Por que filé?" (A06·0). Depois disso a tela não abre mais
    # sozinha, só pelo "?" ao lado de "Seu filé" (RF-F10.02).
    file_intro_seen: Mapped[bool] = mapped_column(default=False, server_default="false")
    # A faixa que ela abriu por último no Descobrir, para a tag "da última vez"
    # (A06·1, #86). Vazia se ela nunca abriu nenhuma.
    last_band: Mapped[EffortBand | None] = mapped_column()
    # "Antes de começar" (A05a, RF-F10.26, #303): as perguntas 1 e 2 do
    # questionário de acompanhamento (#293), respondidas no cadastro. São o
    # "antes" da comparação (D-64), por isso usam as mesmas opções. Vazias
    # quando ela pulou, respondeu só a outra ou criou a conta antes da A05a.
    signup_computing_view: Mapped[ComputingView | None] = mapped_column()
    signup_future_self: Mapped[FutureSelf | None] = mapped_column()

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
