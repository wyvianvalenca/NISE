"""Ingresso, aprovação e indício de lista oficial (fluxos M5 e M7, #270).

Nada daqui guarda dado de terceiros: uma lista oficial é lida em memória pela
busca (#273) e descartada. Só ficam os metadados da chamada (`OfficialList`) e,
para cada menina achada, o indício (`ListMatch`), sem nenhuma linha da lista
(RF-F31.05, RNF-F31.01, RN-23).
"""

import enum
from datetime import date, datetime

from sqlalchemy import TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CourseLevel(enum.Enum):
    """Nível do curso em que ela entrou ou foi aprovada (RF-F6.02)."""

    TECNICO = "tecnico"
    GRADUACAO = "graduacao"


class AdmissionOrigin(enum.Enum):
    """De onde veio o registro (RF-F6.03)."""

    # Ela mesma declarou, num questionário ou no perfil (RF-F6.02, RF-F6.04).
    SELF_DECLARED = "self_declared"
    # A busca achou o nome numa lista oficial e ela confirmou "Sou eu" (RF-F31.04).
    OFFICIAL_LIST = "official_list"


class OfficialList(Base):
    """Uma chamada de uma lista oficial, ex.: UFAL · Sisu 2027 · 1ª chamada.

    Só os metadados públicos da chamada; nenhuma linha da lista (RF-F31.05).
    Uma chamada nova é outra linha, e por isso pode gerar indício de novo para
    quem já respondeu "Não sou eu" numa chamada anterior (RF-F31.06).
    """

    __tablename__ = "official_lists"
    __table_args__ = (UniqueConstraint("institution", "selection_process", "call"),)

    # Sigla, como aparece no card da A19: "UFAL", "IFAL".
    institution: Mapped[str] = mapped_column()
    # Processo seletivo, ex.: "Sisu 2027".
    selection_process: Mapped[str] = mapped_column()
    # Chamada, ex.: "1ª chamada".
    call: Mapped[str] = mapped_column()
    # Endereço público da lista, para o "Ver lista oficial" da A19.
    url: Mapped[str | None] = mapped_column()


class ListMatch(Base):
    """Indício: o nome completo de uma menina apareceu numa lista oficial.

    É só indício, nunca aprovação nem ingresso, até ela confirmar (RN-21). Só
    ela vê os detalhes (RNF-F31.02). Sem resposta até `expires_at`, ele é
    apagado pela rotina diária (RF-F31.06). O item da agenda (#266) não é
    gravado: é calculado a partir daqui.
    """

    __tablename__ = "list_matches"
    __table_args__ = (UniqueConstraint("girl_id", "official_list_id"),)

    girl_id: Mapped[int] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), index=True
    )
    official_list_id: Mapped[int] = mapped_column(
        ForeignKey("official_lists.id", ondelete="RESTRICT"), index=True
    )
    # Curso da linha em que o nome apareceu, ex.: "Ciência da Computação".
    course: Mapped[str] = mapped_column()
    level: Mapped[CourseLevel] = mapped_column()
    # 30 dias depois de criado (MATCH_DAYS em service.py).
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True))
    # Preenchido quando ela responde "Sou eu". "Não sou eu" apaga o indício.
    answered_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # Assíncrono: carregue com selectinload(ListMatch.official_list).
    official_list: Mapped[OfficialList] = relationship()


class MatchEmail(Base):
    """O e-mail que avisa a menina do indício (RF-F31.11, #275).

    Uma linha por indício, garantida pela restrição única (RNF-F4.01): nem a
    busca de novo nem a rotina de envio rodando duas vezes mandam outro. Só
    entra na fila quem aceitou e-mails de oportunidades (RN-30, D-50). Não
    guarda endereço nem texto; some junto com o indício.
    """

    __tablename__ = "match_emails"

    list_match_id: Mapped[int] = mapped_column(
        ForeignKey("list_matches.id", ondelete="CASCADE"), unique=True
    )
    sent_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    # Descartado sem enviar: o indício foi respondido, venceu ou sumiu, ou ela
    # desligou os e-mails de oportunidades antes do envio.
    dropped_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    list_match: Mapped[ListMatch] = relationship()


class DismissedMatch(Base):
    """Marca de um indício apagado ("Não sou eu" ou 30 dias sem resposta).

    Guarda só a menina e a chamada, para a busca não gerar o mesmo indício de
    novo nas rodadas seguintes (RF-F31.06). Nenhum dado da lista.
    """

    __tablename__ = "dismissed_matches"
    __table_args__ = (UniqueConstraint("girl_id", "official_list_id"),)

    girl_id: Mapped[int] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), index=True
    )
    official_list_id: Mapped[int] = mapped_column(
        ForeignKey("official_lists.id", ondelete="CASCADE")
    )


class Approval(Base):
    """A menina foi aprovada num curso, mas ainda não se matriculou (RN-22).

    Fica separado do ingresso: aprovação não conta como ingresso.
    """

    __tablename__ = "approvals"
    __table_args__ = (UniqueConstraint("girl_id", "official_list_id"),)

    girl_id: Mapped[int] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[CourseLevel] = mapped_column()
    course: Mapped[str] = mapped_column()
    institution: Mapped[str] = mapped_column()
    origin: Mapped[AdmissionOrigin] = mapped_column()
    # A chamada de onde veio a aprovação. Vazio se a origem for outra.
    official_list_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_lists.id", ondelete="SET NULL")
    )


class Enrollment(Base):
    """Ingresso: matrícula declarada ou confirmada pela menina (RN-22, RF-F6.03).

    A data e a origem são obrigatórias. O `created_at` diz quando foi
    registrado; `enrolled_on`, quando ela entrou.
    """

    __tablename__ = "enrollments"
    # Um ingresso por chamada. Os declarados por ela (sem chamada) ficam com
    # official_list_id vazio, e NULL não conflita com NULL no Postgres.
    __table_args__ = (UniqueConstraint("girl_id", "official_list_id"),)

    girl_id: Mapped[int] = mapped_column(
        ForeignKey("girls.id", ondelete="CASCADE"), index=True
    )
    level: Mapped[CourseLevel] = mapped_column()
    course: Mapped[str] = mapped_column()
    # Vazio quando ela não diz onde (RF-F6.02, "Onde?" é opcional). Texto livre:
    # nunca vai para exportações, logs nem LLM (RN-11).
    institution: Mapped[str | None] = mapped_column()
    enrolled_on: Mapped[date] = mapped_column()
    origin: Mapped[AdmissionOrigin] = mapped_column()
    # O dia em que ela disse que parou ou trocou de curso (RF-F6.06). O ingresso
    # não é apagado: só ganha esta data.
    left_on: Mapped[date | None] = mapped_column()
    # A chamada confirmada por ela, quando a origem é OFFICIAL_LIST.
    official_list_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_lists.id", ondelete="SET NULL")
    )


class ListSearchRun(Base):
    """Uma rodada da busca que terminou bem: só contagens (RF-F31.05, RN-24).

    Nenhum nome, nem de quem foi achada. Uma rodada que parou por erro não
    grava nada, nem esta linha (RNF-F31.04).
    """

    __tablename__ = "list_search_runs"

    # "copeve" ou, depois, "ifal" (#274).
    source: Mapped[str] = mapped_column()
    selection_process: Mapped[str] = mapped_column()
    # O endereço consultado (RF-F31.05: fonte e link).
    url: Mapped[str] = mapped_column()
    # Os cursos da rodada, ex.: "6,7". Uma rodada pode ser só uma parte.
    courses: Mapped[str] = mapped_column()
    queries: Mapped[int] = mapped_column()
    rows_read: Mapped[int] = mapped_column()
    matches_created: Mapped[int] = mapped_column()
