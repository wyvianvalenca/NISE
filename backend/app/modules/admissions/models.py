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
    institution: Mapped[str] = mapped_column()
    enrolled_on: Mapped[date] = mapped_column()
    origin: Mapped[AdmissionOrigin] = mapped_column()
    # A chamada confirmada por ela, quando a origem é OFFICIAL_LIST.
    official_list_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_lists.id", ondelete="SET NULL")
    )
