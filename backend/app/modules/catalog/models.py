import enum
from datetime import date

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin
from app.modules.actions.models import ActionFormat
from app.modules.girls.models import EffortBand, StudyStage, Topic


class ItemOrigin(enum.Enum):
    """As duas fontes do filé (RF-F11.01, RN-05)."""

    CURATED = "curadoria"
    GROUP_ACTION = "acao"


class ItemKind(enum.Enum):
    """Atividade ela faz quando quiser; evento tem datas e prazo (RF-F10.13).

    Os valores são os mesmos de `SavedKind` no front (frontend/lib/ver-depois.ts).
    """

    ACTIVITY = "atividade"
    EVENT = "evento"


class ItemLevel(enum.Enum):
    """Nível do item, para ordenar as sugestões pelo que ela pediu (#80).

    "Algo mais avançado" e "Muito fácil" sobem o nível; "Muito difícil" desce.
    A ordem da lista é a ordem dos níveis (veja `LEVEL_ORDER` em utils.py).
    """

    BEGINNER = "iniciante"
    INTERMEDIATE = "intermediario"
    ADVANCED = "avancado"


class CuratedType(enum.Enum):
    """Tipos dos itens da curadoria. As ações dos grupos usam `ActionType`.

    Os nomes que aparecem na tela ficam em `CURATED_TYPE_LABELS` (utils.py).
    """

    VIDEO = "video"
    QUIZ = "quiz"
    ARTICLE = "article"
    TUTORIAL = "tutorial"
    MINI_PROJECT = "mini_project"
    COURSE = "course"
    PERSONAL_PROJECT = "personal_project"
    COMMUNITY = "community"
    PLAYLIST = "playlist"
    GAME = "game"
    OLYMPIAD = "olympiad"
    CLUB = "club"
    COHORT_COURSE = "cohort_course"
    HACKATHON = "hackathon"
    INTERNSHIP = "internship"
    OTHER = "other"


class CuratedItem(TimestampMixin, Base):
    """Item da curadoria da equipe NISE (RF-F11.06, D-13).

    Só itens externos: eventos dos grupos entram pela F30 como ações (RN-19).
    A curadoria não tem tela; os itens vêm de scripts/dados/curadoria.json
    pelo script scripts/carregar_curadoria.py. Um item nunca é apagado, só
    desativado (`active`), porque o filé das meninas aponta para ele.

    Atividade e evento ficam na mesma tabela: `kind` diz qual é, e as colunas
    de evento (datas, prazo e pré-requisitos) só são preenchidas nos eventos.
    """

    __tablename__ = "curated_items"
    # O Postgres guarda o nome do membro do enum (ex.: 'EVENT'), não o valor.
    __table_args__ = (
        CheckConstraint(
            "format = 'ONLINE' OR city_ibge_code IS NOT NULL",
            name="ck_curated_items_in_person_has_city",
        ),
        CheckConstraint(
            "kind = 'ACTIVITY' OR (starts_on IS NOT NULL AND ends_on IS NOT NULL)",
            name="ck_curated_items_event_has_dates",
        ),
        CheckConstraint(
            "kind = 'EVENT' OR (starts_on IS NULL AND ends_on IS NULL"
            " AND registration_deadline IS NULL AND prerequisites IS NULL)",
            name="ck_curated_items_activity_has_no_event_fields",
        ),
        CheckConstraint(
            "ends_on >= starts_on", name="ck_curated_items_ends_after_start"
        ),
        CheckConstraint("url LIKE 'https://%'", name="ck_curated_items_url_is_https"),
        CheckConstraint("cost_cents >= 0", name="ck_curated_items_cost_not_negative"),
        CheckConstraint("min_age >= 0", name="ck_curated_items_min_age_not_negative"),
    )

    # Chave do item no arquivo da curadoria, ex.: "scratch-primeiro-projeto".
    # É por ela que o script sabe se atualiza um item ou cria outro.
    slug: Mapped[str] = mapped_column(unique=True)
    kind: Mapped[ItemKind] = mapped_column()
    type: Mapped[CuratedType] = mapped_column()
    title: Mapped[str] = mapped_column()
    # Quem oferece. Num evento, é o organizador (RF-F10.13).
    source: Mapped[str] = mapped_column()
    description: Mapped[str] = mapped_column()
    # Link do site externo. A NISE guarda só o link e não manda nada da menina (RN-19).
    url: Mapped[str] = mapped_column()
    effort_band: Mapped[EffortBand] = mapped_column()
    level: Mapped[ItemLevel] = mapped_column()
    format: Mapped[ActionFormat] = mapped_column()
    # Código do município no IBGE (RN-17). Só nos presenciais.
    city_ibge_code: Mapped[int | None] = mapped_column(
        ForeignKey("cities.id", ondelete="RESTRICT")
    )
    # Vazio quando não há idade mínima.
    min_age: Mapped[int | None] = mapped_column()
    # Em centavos; 0 é grátis.
    cost_cents: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    # Duração aproximada como aparece na tela, ex.: "~10 horas", "~1 semestre".
    duration: Mapped[str] = mapped_column()
    # Validade: depois deste dia o item some das sugestões (RF-F11.07).
    expires_on: Mapped[date | None] = mapped_column()
    # Desativar é o jeito de tirar um item das sugestões (RF-F11.06).
    active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))

    # Só nos eventos (RF-F10.13).
    starts_on: Mapped[date | None] = mapped_column()
    ends_on: Mapped[date | None] = mapped_column()
    registration_deadline: Mapped[date | None] = mapped_column()
    prerequisites: Mapped[str | None] = mapped_column()

    # Assíncrono: carregue com selectinload(CuratedItem.topics) e
    # selectinload(CuratedItem.audiences).
    topics: Mapped[list["CuratedItemTopic"]] = relationship(
        cascade="all, delete-orphan"
    )
    audiences: Mapped[list["CuratedItemAudience"]] = relationship(
        cascade="all, delete-orphan"
    )


class CuratedItemTopic(Base):
    """Um tema do item, com os mesmos códigos do perfil da menina (#56)."""

    __tablename__ = "curated_item_topics"
    __table_args__ = (UniqueConstraint("curated_item_id", "topic"),)

    curated_item_id: Mapped[int] = mapped_column(
        ForeignKey("curated_items.id", ondelete="CASCADE"), index=True
    )
    topic: Mapped[Topic] = mapped_column()


class CuratedItemAudience(Base):
    """Uma etapa de estudo para quem o item serve. Sem nenhuma, serve para todas."""

    __tablename__ = "curated_item_audiences"
    __table_args__ = (UniqueConstraint("curated_item_id", "stage"),)

    curated_item_id: Mapped[int] = mapped_column(
        ForeignKey("curated_items.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[StudyStage] = mapped_column()
