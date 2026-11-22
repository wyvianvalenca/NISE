"""Questionário de acompanhamento "Como está seu caminho?" (A18, M5, #293).

É um questionário só, fixo e igual para todas (D-60). Sai 3, 6, 12 e 18 meses
depois que a menina criou a conta (RN-02) e fica aberto 30 dias (RN-39). As
respostas ficam ligadas à menina e à rodada, não a uma ação (RF-F4.07): por
isso não usam a tabela `answers`, que é por ação.
"""

import enum

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class FollowupRound(enum.Enum):
    """A rodada do questionário: quantos meses depois de criar a conta."""

    THREE_MONTHS = "three_months"
    SIX_MONTHS = "six_months"
    TWELVE_MONTHS = "twelve_months"
    EIGHTEEN_MONTHS = "eighteen_months"


class ComputingView(enum.Enum):
    """Pergunta 1: "Hoje, computação pra você é…"."""

    WANT_TO_FOLLOW = "want_to_follow"
    LIKE_BUT_UNSURE = "like_but_unsure"
    LESS_INTERESTED = "less_interested"
    NOT_FOR_ME = "not_for_me"


class FutureSelf(enum.Enum):
    """Pergunta 2: "Daqui a uns anos, você se vê estudando ou trabalhando…"."""

    SURE = "sure"
    MAYBE = "maybe"
    PROBABLY_NOT = "probably_not"


class Activity(enum.Enum):
    """Pergunta 4: "Desde a última vez, você…" (várias escolhas)."""

    ONLINE_COURSE = "online_course"
    EVENT = "event"
    SELF_STUDY = "self_study"
    PROJECT = "project"
    # "Nada disso ainda": não vem junto com as outras.
    NONE_YET = "none_yet"


class HelpWanted(enum.Enum):
    """Pergunta 5: "O que te ajudaria agora?" (várias escolhas)."""

    MENTORING = "mentoring"
    ONLINE_COURSES = "online_courses"
    INTERNSHIP = "internship"
    EVENTS = "events"
    OTHER = "other"


class CourseStatus(enum.Enum):
    """Pergunta 3: "Você entrou num curso da área?" (RF-F6.02).

    Os dois primeiros valores são os mesmos de `CourseLevel` (ingresso).
    "Tô tentando entrar" não conta como ingresso (RN-22).
    """

    TECNICO = "tecnico"
    GRADUACAO = "graduacao"
    TRYING = "trying"
    NOT_YET = "not_yet"


class CourseCode(enum.Enum):
    """O curso escolhido na pergunta 3: lista fixa, igual para os dois níveis."""

    SISTEMAS_INFORMACAO = "sistemas_informacao"
    CIENCIA_COMPUTACAO = "ciencia_computacao"
    ENGENHARIA_COMPUTACAO = "engenharia_computacao"
    REDES = "redes"
    # Ela digita o nome do curso (RN-11: o texto nunca sai do banco).
    OUTRO = "outro"


class StillEnrolled(enum.Enum):
    """Pergunta 3 para quem já registrou um curso: "Continua nesse curso?" (#299)."""

    YES = "yes"
    CHANGED = "changed"
    STOPPED = "stopped"


class FollowupAnswer(Base):
    """As respostas de uma menina a uma rodada do questionário (RF-F4.07).

    Todas as perguntas são opcionais. "Agora não" não grava nada: a rodada
    continua pendente até fechar. Uma resposta não é editada, então não há
    `updated_at`; o `created_at` é a data da resposta.

    Os grupos de que ela participou só veem as respostas somadas, nunca as
    dela sozinhas (D-61).
    """

    __tablename__ = "followup_answers"
    # Uma resposta por menina e rodada: a segunda é recusada.
    __table_args__ = (UniqueConstraint("girl_id", "round"),)

    # Sem index=True: a restrição de unicidade acima já cria um índice que
    # começa por girl_id.
    girl_id: Mapped[int] = mapped_column(ForeignKey("girls.id", ondelete="CASCADE"))
    round: Mapped[FollowupRound] = mapped_column()
    computing_view: Mapped[ComputingView | None] = mapped_column()
    future_self: Mapped[FutureSelf | None] = mapped_column()
    # Pergunta 3, para quem não tem curso registrado. O curso em si fica em
    # `Enrollment` (admissions), gravado junto com esta resposta (RNF-F6.01).
    course_status: Mapped[CourseStatus | None] = mapped_column()
    # Pergunta 3, para quem já tem curso registrado (#299).
    still_enrolled: Mapped[StillEnrolled | None] = mapped_column()
    # Pergunta 6, "Quer contar mais?". Texto livre: nunca vai para logs, LLM
    # nem exportações (RN-11).
    comment: Mapped[str | None] = mapped_column()

    activities: Mapped[list["FollowupActivity"]] = relationship(
        cascade="all, delete-orphan"
    )
    helps: Mapped[list["FollowupHelp"]] = relationship(cascade="all, delete-orphan")


class FollowupActivity(Base):
    """Uma escolha da pergunta 4. Uma linha por escolha."""

    __tablename__ = "followup_activities"
    __table_args__ = (UniqueConstraint("answer_id", "activity"),)

    answer_id: Mapped[int] = mapped_column(
        ForeignKey("followup_answers.id", ondelete="CASCADE")
    )
    # Nome do tipo no banco explícito: "activity" sozinho é genérico demais.
    activity: Mapped[Activity] = mapped_column(Enum(Activity, name="followupactivity"))


class FollowupHelp(Base):
    """Uma escolha da pergunta 5. Uma linha por escolha."""

    __tablename__ = "followup_helps"
    __table_args__ = (UniqueConstraint("answer_id", "help"),)

    answer_id: Mapped[int] = mapped_column(
        ForeignKey("followup_answers.id", ondelete="CASCADE")
    )
    help: Mapped[HelpWanted] = mapped_column()
