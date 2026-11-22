import enum
from datetime import date

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import TimestampMixin


class FileStatus(enum.Enum):
    """Onde um item está no filé da menina (tabela de status da #78).

    "Quero fazer" põe o item em NEXT. Uma atividade anda de NEXT para
    IN_PROGRESS e de IN_PROGRESS para CONCLUDED, nessa ordem (#119). Um evento
    vira SIGNED_UP quando ela confirma a inscrição (RF-F10.14). LATER é o "Ver
    depois" e DISMISSED é o "Não é pra mim", que guarda o motivo.

    "Tirar do filé", "Remover" e "Desfazer" apagam a linha: o item volta a
    poder ser sugerido.
    """

    NEXT = "next"
    IN_PROGRESS = "in_progress"
    CONCLUDED = "concluded"
    SIGNED_UP = "signed_up"
    LATER = "later"
    DISMISSED = "dismissed"


class DismissReason(enum.Enum):
    """Motivos do "Não é pra mim" (A06·2a), na ordem do Figma.

    Os valores são os mesmos de `REASONS` no front (frontend/lib/sugestoes.ts).
    """

    JA_CONHECO = "ja-conheco"
    MUITO_DIFICIL = "muito-dificil"
    MUITO_FACIL = "muito-facil"
    NAO_CURTO_O_TEMA = "nao-curto-o-tema"
    SEM_TEMPO_AGORA = "sem-tempo-agora"
    OUTRO_MOTIVO = "outro-motivo"


class SimilarChoice(enum.Enum):
    """Resposta do "Quer sugestões parecidas?" da atividade concluída (A06·5, RF-F10.09).

    Os valores são os mesmos de `SIMILAR_OPTIONS` no front
    (frontend/lib/atividade-feedback.ts). Como cada um muda as próximas
    sugestões está em app/modules/suggestions/service.py (#80).
    """

    MAIS_AVANCADO = "mais-avancado"
    MESMO_NIVEL = "mesmo-nivel"
    OUTRO_TEMA = "outro-tema"
    POR_ENQUANTO_NAO = "por-enquanto-nao"  # "Por enquanto, tá bom"


class FileEntry(TimestampMixin, Base):
    """O que a menina fez com um item do catálogo: uma linha por menina e item.

    O item vem de uma das duas fontes (RF-F11.01): ou da curadoria ou de uma
    ação de grupo, nunca das duas. Nada daqui vai para o link do item (RN-19).
    """

    __tablename__ = "file_entries"
    # O Postgres guarda o nome do membro do enum (ex.: 'DISMISSED'), não o valor.
    __table_args__ = (
        UniqueConstraint("girl_id", "curated_item_id"),
        UniqueConstraint("girl_id", "action_id"),
        CheckConstraint(
            "num_nonnulls(curated_item_id, action_id) = 1",
            name="ck_file_entries_one_source",
        ),
        CheckConstraint(
            "status = 'DISMISSED' OR dismiss_reason IS NULL",
            name="ck_file_entries_reason_only_when_dismissed",
        ),
        CheckConstraint(
            "rating BETWEEN 1 AND 5", name="ck_file_entries_rating_from_1_to_5"
        ),
        CheckConstraint(
            "status = 'CONCLUDED' OR (rating IS NULL AND similar_choice IS NULL)",
            name="ck_file_entries_feedback_only_when_concluded",
        ),
        CheckConstraint(
            "status = 'CONCLUDED' OR concluded_on IS NULL",
            name="ck_file_entries_concluded_on_only_when_concluded",
        ),
    )

    girl_id: Mapped[int] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), index=True
    )
    # Itens da curadoria não são apagados, só desativados; RESTRICT protege o filé.
    curated_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("curated_items.id", ondelete="RESTRICT"), index=True
    )
    # Excluir uma ação apaga também as inscrições dela (RF-F30.12); o filé segue igual.
    action_id: Mapped[int | None] = mapped_column(
        ForeignKey("actions.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[FileStatus] = mapped_column()
    # Só no "Não é pra mim", e opcional mesmo nele (RF-F10.04).
    dismiss_reason: Mapped[DismissReason | None] = mapped_column()
    # Só numa atividade concluída, e as duas são opcionais (RF-F10.09, RN-28).
    # Quem grava é a rota da #125; as sugestões (#80) leem as duas.
    rating: Mapped[int | None] = mapped_column()
    similar_choice: Mapped[SimilarChoice | None] = mapped_column()
    # O dia em que ela tocou "Marcar como concluída" (A06·4a, #119), no fuso de
    # Maceió. Só numa atividade concluída.
    concluded_on: Mapped[date | None] = mapped_column()
