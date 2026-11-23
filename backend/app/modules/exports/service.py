"""Exportação anônima dos dados do grupo (F24, #375 e #377).

A Base sempre sai; os pacotes de colunas a coordenadora liga ou desliga
(RF-F24.08, #377). O código da menina é sorteado a cada exportação e nunca sai de um
dado dela (RN-09); data de nascimento vira faixa e datas viram mês e ano
(RF-F24.04). Nome, e-mail, telefone, escola e texto livre nem são lidos.
"""

import csv
import io
import secrets
import unicodedata
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from typing import Literal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import Action, Participation
from app.modules.admissions.models import CourseLevel, Enrollment
from app.modules.answers.models import Answer, AnswerStage
from app.modules.catalog.utils import ACTION_TYPE_LABELS
from app.modules.cities.models import City
from app.modules.exports.models import DataExport
from app.modules.followup.models import ComputingView, FollowupAnswer, FollowupRound
from app.modules.girls.models import Girl
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS, age_on
from app.modules.groups.models import Group
from app.users.models import User

# O link vale 15 minutos e o texto do arquivo some do servidor em 24 horas.
LINK_LIFETIME = timedelta(minutes=15)
FILE_LIFETIME = timedelta(hours=24)

# Quantas linhas o passo "Revisão" mostra (RF-F24.32).
PREVIEW_ROWS = 5

# Excel e Sheets só acertam os acentos de um CSV em UTF-8 que começa com BOM.
BOM = "﻿"

# Sem 0/O e 1/I, que se confundem quando a coordenadora lê o código.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 4

# Quem abre o CSV no Excel pode ter uma fórmula executada numa célula que
# começa com um destes caracteres (o nome da ação é digitado por uma pessoa).
FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")

# Como a coluna é pintada na legenda da Revisão.
ColumnKind = Literal["code", "generalized", "action"]

# RN-13: todo campo é identificador direto, quase-identificador, analítico ou
# texto livre. Só o identificador direto e o texto livre nunca saem; por isso uma
# coluna só pode ser quase-identificador (sai generalizado) ou analítica. Sem
# classe, a coluna não é exportada.
Classification = Literal["quasi_identifier", "analytic"]


@dataclass(frozen=True)
class Column:
    key: str
    label: str
    kind: ColumnKind
    classification: Classification | None = None


class Package(StrEnum):
    """Os pacotes que a coordenadora liga ou desliga (RF-F24.08)."""

    GROUPS = "groups"
    FUNNEL = "funnel"
    RATINGS = "ratings"
    INTEREST = "interest"
    ADMISSION = "admission"
    OTHER_GROUPS = "other_groups"


# Enquanto não há modelos (#379), tudo liga, menos "Outros grupos" (RF-F24.15).
DEFAULT_PACKAGES: tuple[Package, ...] = (
    Package.GROUPS,
    Package.FUNNEL,
    Package.RATINGS,
    Package.INTEREST,
    Package.ADMISSION,
)

# As colunas da Base, na ordem do arquivo (RF-F24.08).
BASE_COLUMNS: tuple[Column, ...] = (
    Column("code", "código", "code", "analytic"),
    Column("age_band", "faixa etária", "generalized", "quasi_identifier"),
    Column("city", "município", "action", "quasi_identifier"),
    Column("study_stage", "etapa escolar", "action", "quasi_identifier"),
    Column("type", "tipo", "action", "analytic"),
    Column("tags", "tags", "action", "analytic"),
    Column("action_month", "mês", "generalized", "quasi_identifier"),
    Column("action_name", "ação", "action", "analytic"),
)

# As colunas de cada pacote. Nunca há comentário (texto livre, RN-11) nem a
# instituição do ingresso (RF-F24.02).
PACKAGE_COLUMNS: dict[Package, tuple[Column, ...]] = {
    Package.GROUPS: (
        Column("comparison", "grupo de comparação", "action", "analytic"),
    ),
    Package.FUNNEL: (
        Column("signed_up", "inscrita", "action", "analytic"),
        Column("present", "presente", "action", "analytic"),
        Column("concluded", "concluinte", "action", "analytic"),
    ),
    Package.RATINGS: (Column("rating", "nota da avaliação", "action", "analytic"),),
    Package.INTEREST: (
        Column("interest_signup", "interesse_cadastro", "action", "analytic"),
        Column("interest_3m", "interesse_3m", "action", "analytic"),
        Column("interest_6m", "interesse_6m", "action", "analytic"),
        Column("interest_12m", "interesse_12m", "action", "analytic"),
        Column("interest_18m", "interesse_18m", "action", "analytic"),
    ),
    Package.ADMISSION: (
        Column("entered", "ingressou", "action", "analytic"),
        Column("entry_level", "nível de ingresso", "action", "analytic"),
        Column("entry_area", "área de ingresso", "generalized", "quasi_identifier"),
    ),
    Package.OTHER_GROUPS: (
        Column("other_groups", "outros grupos", "generalized", "quasi_identifier"),
    ),
}

# Área de ingresso com menos meninas que isso vira "TI (agrupado)" (RF-F24.35).
MIN_GIRLS_PER_AREA = 5
GROUPED_AREA = "TI (agrupado)"

# "Hoje, computação pra você é…", como nas opções do questionário (RF-F5.04).
COMPUTING_VIEW_LABELS: dict[ComputingView, str] = {
    ComputingView.WANT_TO_FOLLOW: "Quero seguir",
    ComputingView.LIKE_BUT_UNSURE: "Gosto, mas não sei",
    ComputingView.LESS_INTERESTED: "Já não me interessa tanto",
    ComputingView.NOT_FOR_ME: "Não é pra mim",
}
INTEREST_KEYS: dict[FollowupRound, str] = {
    FollowupRound.THREE_MONTHS: "interest_3m",
    FollowupRound.SIX_MONTHS: "interest_6m",
    FollowupRound.TWELVE_MONTHS: "interest_12m",
    FollowupRound.EIGHTEEN_MONTHS: "interest_18m",
}
LEVEL_LABELS: dict[CourseLevel, str] = {
    CourseLevel.TECNICO: "técnico",
    CourseLevel.GRADUACAO: "graduação",
}


def columns_for(packages: Iterable[Package]) -> tuple[Column, ...]:
    """A Base e as colunas dos pacotes ligados, sempre na mesma ordem.

    Coluna sem classificação nunca sai (RN-13).
    """
    chosen = set(packages)
    columns = list(BASE_COLUMNS)
    for package in Package:
        if package in chosen:
            columns.extend(PACKAGE_COLUMNS[package])
    return tuple(c for c in columns if c.classification is not None)


@dataclass(frozen=True)
class ExportTable:
    columns: tuple[Column, ...]
    rows: list[list[str]]


def age_band(birth_date: date | None, reference: date) -> str:
    """Faixa etária: "13", "14-15", "16-17" ou "18+". Vazia sem data de nascimento."""
    if birth_date is None:
        return ""
    age = age_on(birth_date, reference)
    if age is None:
        return ""
    if age <= 13:
        return "13"
    if age <= 15:
        return "14-15"
    if age <= 17:
        return "16-17"
    return "18+"


def month_of(day: date) -> str:
    """Mês e ano, "2026-10"."""
    return f"{day.year}-{day.month:02d}"


def new_code(taken: set[str]) -> str:
    """Código sorteado, como "M-Q4T2". Não vem de nenhum dado da menina (RN-09)."""
    while True:
        letters = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        code = f"M-{letters}"
        if code not in taken:
            taken.add(code)
            return code


def safe_cell(value: str) -> str:
    """Impede que o texto vire fórmula ao abrir no Excel ou no Sheets."""
    return f"'{value}" if value.startswith(FORMULA_STARTS) else value


def attendance_cell(action: Action, participation: Participation) -> str:
    """ "sim" se ela veio, "não" se faltou, vazio se a presença ainda não foi anotada."""
    if participation.attended_at is not None:
        return "sim"
    return "não" if action.attendance_registered_at is not None else ""


def comparison_cell(action: Action, participation: Participation) -> str:
    """ "participante" ou "não compareceu". "Chegou sozinha" vem na #380."""
    return {"sim": "participante", "não": "não compareceu"}.get(
        attendance_cell(action, participation), ""
    )


def concluded_cell(action: Action, participation: Participation, today: date) -> str:
    """Concluinte: veio e a ação já terminou (suposição da #377, a confirmar)."""
    present = attendance_cell(action, participation)
    if present == "sim" and action.ends_on > today:
        return "não"
    return present


async def interest_by_girl(
    session: AsyncSession, girl_ids: set[int]
) -> dict[int, dict[str, str]]:
    """A resposta de cada marco (3, 6, 12 e 18 meses) por menina (D-103).

    O marco "cadastro" ainda não tem onde ser guardado (#303): sai vazio.
    """
    found: dict[int, dict[str, str]] = {}
    query = select(FollowupAnswer).where(
        FollowupAnswer.girl_id.in_(girl_ids), FollowupAnswer.computing_view.is_not(None)
    )
    for answer in await session.scalars(query):
        if answer.computing_view is not None:
            found.setdefault(answer.girl_id, {})[INTEREST_KEYS[answer.round]] = (
                COMPUTING_VIEW_LABELS[answer.computing_view]
            )
    return found


async def entry_by_girl(
    session: AsyncSession, group_id: int, girl_ids: set[int]
) -> dict[int, tuple[str, str]]:
    """Nível e área do ingresso mais recente de cada menina (nunca a instituição).

    Área com menos de 5 meninas no arquivo vira "TI (agrupado)" (RF-F24.35). A
    contagem usa todas as meninas do grupo, não só as linhas da Revisão.
    """
    everyone = (
        select(Participation.girl_id)
        .join(Action, Action.id == Participation.action_id)
        .where(Action.group_id == group_id)
    )
    enrollments = await session.scalars(
        select(Enrollment)
        .where(Enrollment.girl_id.in_(everyone))
        .order_by(Enrollment.enrolled_on.desc(), Enrollment.id.desc())
    )
    latest: dict[int, Enrollment] = {}
    for enrollment in enrollments:
        latest.setdefault(enrollment.girl_id, enrollment)
    per_area = Counter(e.course for e in latest.values())
    return {
        girl_id: (
            LEVEL_LABELS[e.level],
            e.course if per_area[e.course] >= MIN_GIRLS_PER_AREA else GROUPED_AREA,
        )
        for girl_id, e in latest.items()
        if girl_id in girl_ids
    }


async def other_groups_by_girl(
    session: AsyncSession, group_id: int, girl_ids: set[int]
) -> dict[int, int]:
    """Quantas ações de outros grupos ela frequentou. Só o número (RF-F24.15)."""
    rows = await session.execute(
        select(Participation.girl_id, func.count(Participation.id))
        .join(Action, Action.id == Participation.action_id)
        .where(
            Participation.girl_id.in_(girl_ids),
            Participation.attended_at.is_not(None),
            Action.group_id != group_id,
        )
        .group_by(Participation.girl_id)
    )
    return {girl_id: count for girl_id, count in rows}


async def build_table(
    session: AsyncSession,
    group_id: int,
    today: date,
    limit: int | None = None,
    packages: Iterable[Package] = DEFAULT_PACKAGES,
) -> ExportTable:
    """Uma linha por menina e ação, só das ações do grupo (RF-F24.01, RN-07).

    Quem apagou a conta não tem mais inscrição no banco, então não aparece
    (RN-12). Com `limit`, devolve só as primeiras linhas, para a Revisão. A
    Base sempre vem; `packages` diz quais pacotes entram (RF-F24.08).
    """
    chosen = set(packages)
    columns = columns_for(chosen)
    query = (
        select(Participation, Action, Girl, City.name)
        .join(Action, Action.id == Participation.action_id)
        .join(Girl, Girl.id == Participation.girl_id)
        .outerjoin(City, City.id == Girl.city_ibge_code)
        .where(Action.group_id == group_id)
        .options(selectinload(Action.topics))
        .order_by(Action.starts_on, Action.id, Participation.id)
    )
    if limit is not None:
        query = query.limit(limit)
    found = list((await session.execute(query)).all())
    girl_ids = {girl.id for _, _, girl, _ in found}

    ratings: dict[tuple[int, int], int | None] = {}
    if Package.RATINGS in chosen and found:
        for answer in await session.scalars(
            select(Answer).where(
                Answer.girl_id.in_(girl_ids), Answer.stage == AnswerStage.RATING
            )
        ):
            ratings[(answer.girl_id, answer.action_id)] = answer.score
    interest = (
        await interest_by_girl(session, girl_ids) if Package.INTEREST in chosen else {}
    )
    entries = (
        await entry_by_girl(session, group_id, girl_ids)
        if Package.ADMISSION in chosen
        else {}
    )
    others = (
        await other_groups_by_girl(session, group_id, girl_ids)
        if Package.OTHER_GROUPS in chosen
        else {}
    )

    codes: dict[int, str] = {}
    taken: set[str] = set()
    rows: list[list[str]] = []
    for participation, action, girl, city_name in found:
        if girl.id not in codes:
            codes[girl.id] = new_code(taken)
        stage = participation.study_stage or girl.study_stage
        score = ratings.get((girl.id, action.id))
        entry = entries.get(girl.id)
        values = {
            "code": codes[girl.id],
            "age_band": age_band(girl.birth_date, today),
            "city": city_name or "",
            "study_stage": STUDY_STAGE_LABELS[stage] if stage else "",
            "type": ACTION_TYPE_LABELS[action.type],
            "tags": ", ".join(sorted(TOPIC_LABELS[tag.topic] for tag in action.topics)),
            "action_month": month_of(action.starts_on),
            "action_name": action.name,
            "comparison": comparison_cell(action, participation),
            "signed_up": "sim",
            "present": attendance_cell(action, participation),
            "concluded": concluded_cell(action, participation, today),
            "rating": "" if score is None else str(score),
            "entered": "sim" if entry else "não",
            "entry_level": entry[0] if entry else "",
            "entry_area": entry[1] if entry else "",
            "other_groups": str(others.get(girl.id, 0)),
            **{
                key: interest.get(girl.id, {}).get(key, "")
                for key in ("interest_signup", *INTEREST_KEYS.values())
            },
        }
        rows.append([values[column.key] for column in columns])

    return ExportTable(columns, rows)


def to_csv(table: ExportTable) -> str:
    """O texto do arquivo: UTF-8 com BOM, separador ";" (abre certo no Excel)."""
    out = io.StringIO()
    writer = csv.writer(out, delimiter=";", lineterminator="\r\n")
    writer.writerow([column.label for column in table.columns])
    for row in table.rows:
        writer.writerow([safe_cell(cell) for cell in row])
    return BOM + out.getvalue()


def slugify(text: str) -> str:
    """ "Rendeiras do Código" vira "rendeiras-do-codigo"."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return "-".join("".join(c if c.isalnum() else " " for c in plain.lower()).split())


def file_name(group_name: str, day: date) -> str:
    # Ainda não há modelos (#379): o meio do nome é fixo.
    return f"{slugify(group_name)}_dados-anonimos_{day.isoformat()}.csv"


async def purge_old_files(session: AsyncSession, now: datetime | None = None) -> int:
    """Apaga o texto dos arquivos com mais de 24 horas. A linha de registro fica."""
    if now is None:
        now = datetime.now(UTC)
    result = await session.execute(
        update(DataExport)
        .where(
            DataExport.content.is_not(None),
            DataExport.created_at < now - FILE_LIFETIME,
        )
        .values(content=None)
    )
    await session.commit()
    return int(getattr(result, "rowcount", 0) or 0)


async def create_export(
    session: AsyncSession,
    group_id: int,
    user_id: int,
    today: date,
    now: datetime | None = None,
    packages: Iterable[Package] = DEFAULT_PACKAGES,
) -> DataExport:
    """Gera o CSV do grupo e registra a exportação (RN-07)."""
    if now is None:
        now = datetime.now(UTC)
    await purge_old_files(session, now)

    group = await session.get(Group, group_id)
    assert group is not None  # a coordenadora vem de GroupCoordinator

    table = await build_table(session, group_id, today, packages=packages)
    export = DataExport(
        group_id=group_id,
        user_id=user_id,
        filename=file_name(group.name, today),
        row_count=len(table.rows),
        column_count=len(table.columns),
        content=to_csv(table),
        expires_at=now + LINK_LIFETIME,
    )
    session.add(export)
    await session.commit()
    return export


# Quantos itens o painel "Histórico de exportações" traz. Decisão assumida na
# #376 (o doc e o Figma não dizem): as 20 mais recentes.
HISTORY_LIMIT = 20

# O recorte e o modelo ainda não existem (#378, #379): toda exportação é a Base
# de todas as ações do grupo, e é isso que o item diz.
DEFAULT_CUT = "Dados anônimos · todas as ações"


@dataclass(frozen=True)
class HistoryItem:
    id: int
    who: str
    created_at: datetime
    cut: str
    row_count: int


async def list_history(session: AsyncSession, group_id: int) -> list[HistoryItem]:
    """As exportações do grupo, da mais recente para a mais antiga (RF-F24.07).

    Entram as de todas as coordenadoras do grupo. Nada é apagado: só o texto do
    arquivo some (`purge_old_files`), a linha fica.
    """
    rows = await session.execute(
        select(DataExport, User.name)
        .outerjoin(User, User.id == DataExport.user_id)
        .where(DataExport.group_id == group_id)
        .order_by(DataExport.created_at.desc(), DataExport.id.desc())
        .limit(HISTORY_LIMIT)
    )
    return [
        HistoryItem(
            id=export.id,
            # Só o primeiro nome, como no Figma ("Kátia").
            who=name.split()[0] if name and name.split() else "Coordenadora",
            created_at=export.created_at,
            cut=DEFAULT_CUT,
            row_count=export.row_count,
        )
        for export, name in rows
    ]
