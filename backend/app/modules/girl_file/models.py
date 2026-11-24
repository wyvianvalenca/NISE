import enum
from datetime import UTC, date, datetime

from sqlalchemy import TIMESTAMP, CheckConstraint, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.db.base import Base
from app.db.mixins import TimestampMixin


class FileStatus(enum.Enum):
    """Onde um item está no filé da menina (tabela de status da #78).

    "Quero fazer" põe o item em NEXT. Uma atividade anda de NEXT para
    IN_PROGRESS e de IN_PROGRESS para CONCLUDED, nessa ordem (#119). Um evento
    vira SIGNED_UP quando ela confirma a inscrição (RF-F10.14). LATER é o "Ver
    depois" e DISMISSED é o "Não é pra mim", que guarda o motivo. DID_NOT_GO
    é o "Não deu" de um evento de fora que já passou (#190).

    "Tirar do filé", "Remover" e "Desfazer" apagam a linha: o item volta a
    poder ser sugerido.
    """

    NEXT = "next"
    IN_PROGRESS = "in_progress"
    CONCLUDED = "concluded"
    SIGNED_UP = "signed_up"
    LATER = "later"
    DISMISSED = "dismissed"
    # "Não deu" de um evento de fora depois da data (#190): saiu do filé, mas a
    # linha fica para o "Desfazer" saber que ela estava inscrita.
    DID_NOT_GO = "did_not_go"


# O que conta na pílula "Meu filé": tudo o que entrou no filé. O "Ver depois"
# e o "Não é pra mim" ficam de fora.
IN_FILE: list[FileStatus] = [
    FileStatus.NEXT,
    FileStatus.IN_PROGRESS,
    FileStatus.CONCLUDED,
    FileStatus.SIGNED_UP,
]


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
        CheckConstraint(
            "status = 'SIGNED_UP' OR reminder = false",
            name="ck_file_entries_reminder_only_when_signed_up",
        ),
        CheckConstraint(
            "status NOT IN ('NEXT', 'IN_PROGRESS', 'CONCLUDED', 'SIGNED_UP')"
            " OR filed_at IS NOT NULL",
            name="ck_file_entries_filed_at_when_in_file",
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
    # "Me lembra um dia antes" de um evento em que ela se inscreveu (#186). Só
    # numa inscrição: desfazer, tirar do filé ou concluir desliga o lembrete.
    reminder: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    # A data do evento para a qual o lembrete saiu. Uma linha por menina e
    # evento (as restrições de único acima), então ela recebe um lembrete por
    # data do evento (RNF-F4.01); se o evento muda de dia, sai outro.
    reminder_sent_for: Mapped[date | None] = mapped_column()
    # Quando o item entrou no filé (IN_FILE) pela primeira vez: na hora em que
    # a linha é criada já no filé, ou quando sai do "Ver depois" para ele (o
    # "+ Quero fazer"). Vazio enquanto o item nunca entrou no filé. O
    # "Começaram o filé" da aba Resultados conta por aqui (RF-F5.31, D-93):
    # `created_at` não serve, porque o "Quero fazer" do Ver depois só troca o
    # status da linha que já existia.
    #
    # Sair do filé e voltar (o "Não deu" e o "Desfazer" dele) não muda a data:
    # é o mesmo item, não um novo. Tirar do filé apaga a linha, e guardar de
    # novo cria outra, com a data nova.
    filed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    @validates("status")
    def _marks_filed_at(self, key: str, status: FileStatus) -> FileStatus:
        """Guarda `filed_at` sempre que o status muda para um do filé.

        O SQLAlchemy chama isto em todo `entry.status = ...` e em
        `FileEntry(status=...)`, então nenhum caminho que mexe no status
        esquece a data. O banco também confere
        (ck_file_entries_filed_at_when_in_file).
        """
        if status in IN_FILE and self.filed_at is None:
            self.filed_at = datetime.now(UTC)
        return status
