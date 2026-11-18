import enum

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AnswerStage(enum.Enum):
    """Etapa em que a menina responde sobre uma ação (RF-F4.07)."""

    # A avaliação logo depois da ação (A03, #58).
    RATING = "rating"
    # Os questionários de trajetória, depois de 3 e de 6 meses.
    THREE_MONTHS = "three_months"
    SIX_MONTHS = "six_months"


class Answer(Base):
    """Resposta da menina sobre uma ação, ligada a ela, à ação e à etapa (RF-F4.07).

    Na etapa "rating" guarda a nota de 1 a 5 e o comentário opcional
    (RF-F4.03a). "Agora não" não grava nada (RF-F4.03b): a avaliação continua
    pendente para o link do e-mail.

    Uma resposta não é editada, então não há `updated_at` (sem TimestampMixin);
    o `created_at` é a data da resposta.
    """

    __tablename__ = "answers"
    # O Postgres guarda o nome do membro do enum (ex.: 'RATING'), não o valor.
    __table_args__ = (
        # Uma resposta por menina, ação e etapa: a segunda avaliação é recusada.
        UniqueConstraint("girl_id", "action_id", "stage"),
        CheckConstraint("score BETWEEN 1 AND 5", name="ck_answers_score_1_to_5"),
        CheckConstraint(
            "stage <> 'RATING' OR score IS NOT NULL",
            name="ck_answers_rating_has_score",
        ),
    )

    # Sem index=True: a restrição de unicidade acima já cria um índice que
    # começa por girl_id.
    girl_id: Mapped[int] = mapped_column(ForeignKey("girls.id", ondelete="CASCADE"))
    action_id: Mapped[int] = mapped_column(
        ForeignKey("actions.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[AnswerStage] = mapped_column()
    # Nota de 1 a 5. Obrigatória na avaliação; os questionários de 3 e 6 meses
    # ainda não têm formato definido.
    score: Mapped[int | None] = mapped_column()
    # Texto livre da menina. Nunca vai para a LLM nem para os logs.
    comment: Mapped[str | None] = mapped_column()
