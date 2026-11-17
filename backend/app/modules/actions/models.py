import enum
from datetime import date

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TimestampMixin


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
