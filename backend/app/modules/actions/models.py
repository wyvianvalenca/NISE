import enum
from datetime import date, datetime, time

from sqlalchemy import TIMESTAMP, CheckConstraint, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin
from app.modules.girls.models import StudyStage, Topic

DESCRIPTION_MAX_LENGTH = 300


class ActionType(enum.Enum):
    """Lista fixa de tipos de ação (RF-F17.01)."""

    OFICINA = "oficina"
    PALESTRA = "palestra"
    MINICURSO = "minicurso"
    HACKATHON = "hackathon"
    VISITA = "visita"
    ACOLHIMENTO = "acolhimento"
    OUTRO = "outro"


class ActionFormat(enum.Enum):
    IN_PERSON = "in_person"
    ONLINE = "online"


class ActionVisibility(enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class ActionStatus(enum.Enum):
    """Where an action is in its life (RN-37).

    It is computed on every query by `compute_status` and never stored, so there
    is no column of this type.
    """

    AWAITING_REGISTRATIONS = "awaiting_registrations"
    AWAITING_EVENT = "awaiting_event"
    AWAITING_ATTENDANCE = "awaiting_attendance"
    CONCLUDED = "concluded"


class Action(TimestampMixin, Base):
    """Ação de um grupo, com os campos obrigatórios da RF-F30.01."""

    __tablename__ = "actions"
    # O Postgres guarda o nome do membro do enum (ex.: 'ONLINE'), não o valor.
    __table_args__ = (
        CheckConstraint("ends_on >= starts_on", name="ck_actions_ends_after_start"),
        CheckConstraint(
            "format = 'ONLINE' OR city_ibge_code IS NOT NULL",
            name="ck_actions_in_person_has_city",
        ),
        CheckConstraint(
            "visibility = 'CLOSED' OR registration_url IS NOT NULL",
            name="ck_actions_open_has_registration_url",
        ),
        CheckConstraint(
            f"char_length(description) <= {DESCRIPTION_MAX_LENGTH}",
            name="ck_actions_description_max_length",
        ),
    )

    # RN-14: toda ação pertence a um único grupo. RESTRICT impede apagar um
    # grupo que ainda tem ações.
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column()
    type: Mapped[ActionType] = mapped_column()
    starts_on: Mapped[date] = mapped_column()
    ends_on: Mapped[date] = mapped_column()
    format: Mapped[ActionFormat] = mapped_column()
    # Código do município no IBGE (RN-17), sempre um dos de `cities` (#50).
    city_ibge_code: Mapped[int | None] = mapped_column(
        ForeignKey("cities.id", ondelete="RESTRICT")
    )
    visibility: Mapped[ActionVisibility] = mapped_column()
    registration_url: Mapped[str | None] = mapped_column()
    # Optional details of the registration (RF-F30.03).
    starts_at_time: Mapped[time | None] = mapped_column()
    ends_at_time: Mapped[time | None] = mapped_column()
    address: Mapped[str | None] = mapped_column()
    description: Mapped[str | None] = mapped_column()
    # Whether registrations are open. It is separate from the status (RN-37):
    # closing and reopening them belongs to the C2 stories (#134).
    registrations_open: Mapped[bool] = mapped_column(
        default=True, server_default=text("true")
    )
    # When the coordinator saved the attendance of the action, even if nobody
    # came. `participations.attended_at` is per girl and cannot say this. The
    # attendance story (C3, #135) fills it; the status reads it (RN-37).
    attendance_registered_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True)
    )

    # Async: load with selectinload(Action.audiences) and selectinload(Action.topics).
    audiences: Mapped[list["ActionAudience"]] = relationship(
        cascade="all, delete-orphan"
    )
    topics: Mapped[list["ActionTopic"]] = relationship(cascade="all, delete-orphan")


class ActionAudience(Base):
    """One study stage the action is for. One row per stage (RF-F30.03)."""

    __tablename__ = "action_audiences"
    __table_args__ = (UniqueConstraint("action_id", "stage"),)

    action_id: Mapped[int] = mapped_column(
        ForeignKey("actions.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[StudyStage] = mapped_column()


class ActionTopic(Base):
    """One tag of the action, one of the 8 topics of the girl's profile (D-44).

    Never free text: the column only takes `Topic` values (RF-F17.02).
    """

    __tablename__ = "action_topics"
    __table_args__ = (UniqueConstraint("action_id", "topic"),)

    action_id: Mapped[int] = mapped_column(
        ForeignKey("actions.id", ondelete="CASCADE"), index=True
    )
    topic: Mapped[Topic] = mapped_column()


class Participation(Base):
    """Menina × ação. Um registro por menina reúne as ações de todos os grupos (RF-F2.03)."""

    __tablename__ = "participations"
    # Importar a mesma lista duas vezes não duplica a inscrição (RF-F1.08).
    __table_args__ = (UniqueConstraint("girl_id", "action_id"),)

    girl_id: Mapped[int] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), index=True
    )
    action_id: Mapped[int] = mapped_column(
        ForeignKey("actions.id", ondelete="CASCADE"), index=True
    )
    # Quando a presença dela foi registrada (F3, #135). Vazio enquanto não foi,
    # ou se ela faltou. Só quem tem presença avalia a ação (#58).
    attended_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    # The coordinator's mark saved with "Salvar e continuar depois" (#340,
    # RF-F3.04). It is only the state of her page: it is not attendance, sends
    # nothing and counts for nothing until "Concluir presença" (D-81, RN-37).
    saved_present: Mapped[bool] = mapped_column(
        default=False, server_default=text("false")
    )
