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
from typing import Any, Literal

from sqlalchemy import (
    ColumnElement,
    Select,
    distinct,
    exists,
    extract,
    func,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import (
    Action,
    ActionTopic,
    ActionType,
    Participation,
)
from app.modules.admissions.models import CourseLevel, Enrollment
from app.modules.answers.models import Answer, AnswerStage
from app.modules.catalog.utils import ACTION_TYPE_LABELS
from app.modules.cities.models import City
from app.modules.exports.models import DataExport
from app.modules.followup.models import ComputingView, FollowupAnswer, FollowupRound
from app.modules.girls.models import Girl, Topic
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


# Sem modelo, tudo liga, menos "Outros grupos" (RF-F24.15).
DEFAULT_PACKAGES: tuple[Package, ...] = (
    Package.GROUPS,
    Package.FUNNEL,
    Package.RATINGS,
    Package.INTEREST,
    Package.ADMISSION,
)


class ExportModel(StrEnum):
    """Os quatro modelos do primeiro passo (RF-F24.10). Cada um já marca pacotes."""

    ACCOUNTABILITY = "accountability"
    RESEARCH = "research"
    PLANNING = "planning"
    MY_WAY = "my_way"


MODEL_NAMES: dict[ExportModel, str] = {
    ExportModel.ACCOUNTABILITY: "Prestação de contas",
    ExportModel.RESEARCH: "Pesquisa",
    ExportModel.PLANNING: "Planejar a próxima ação",
    ExportModel.MY_WAY: "Do meu jeito",
}

# O pedaço do nome do arquivo (RF-F24.34: "rendeiras_prestacao-contas_2026-10-16.csv").
MODEL_SLUGS: dict[ExportModel, str] = {
    ExportModel.ACCOUNTABILITY: "prestacao-contas",
    ExportModel.RESEARCH: "pesquisa",
    ExportModel.PLANNING: "planejar-proxima-acao",
    ExportModel.MY_WAY: "do-meu-jeito",
}

# Pacotes que cada modelo liga. O doc e o Figma não dizem todos (#379): o cartão
# de cada modelo é a fonte. "Pesquisa" é "todos os pacotes" menos "Outros grupos",
# que vem desligado (RF-F24.15, Figma A2). "Do meu jeito" começa como o padrão.
MODEL_PACKAGES: dict[ExportModel, tuple[Package, ...]] = {
    ExportModel.ACCOUNTABILITY: (Package.FUNNEL, Package.RATINGS),
    ExportModel.RESEARCH: DEFAULT_PACKAGES,
    ExportModel.PLANNING: (Package.RATINGS, Package.INTEREST),
    ExportModel.MY_WAY: DEFAULT_PACKAGES,
}


def packages_of(model: ExportModel | None) -> tuple[Package, ...]:
    """Sem modelo vale "Do meu jeito" (D-104)."""
    return MODEL_PACKAGES[model or ExportModel.MY_WAY]


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
class ExportCut:
    """O recorte do primeiro passo (RF-F24.09). Campo vazio é "todos"."""

    year: int | None = None
    action_id: int | None = None
    type: ActionType | None = None
    tag: Topic | None = None

    def as_json(self) -> dict[str, int | str | None]:
        """Como o recorte fica guardado no registro da exportação."""
        return {
            "year": self.year,
            "action_id": self.action_id,
            "type": self.type.value if self.type else None,
            "tag": self.tag.value if self.tag else None,
        }


# Sem recorte: todas as ações do grupo.
NO_CUT = ExportCut()


@dataclass(frozen=True)
class ExportSummary:
    """O resumo do arquivo conforme o recorte (RF-F24.33)."""

    rows: int
    girls: int
    alone: int
    actions: int


@dataclass(frozen=True)
class ActionOption:
    id: int
    name: str
    starts_on: date


@dataclass(frozen=True)
class CutOptions:
    years: list[int]
    actions: list[ActionOption]


@dataclass(frozen=True)
class ExportTable:
    columns: tuple[Column, ...]
    rows: list[list[str]]
    # Uma marca por linha: a linha é de quem chegou sozinha (a Revisão a pinta).
    alone: list[bool]


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


def cut_filters(group_id: int, cut: ExportCut) -> list[ColumnElement[bool]]:
    """As condições sobre `Action`: o grupo (RN-07) e o que ela recortou."""
    filters: list[ColumnElement[bool]] = [Action.group_id == group_id]
    if cut.year is not None:
        filters.append(extract("year", Action.starts_on) == cut.year)
    if cut.action_id is not None:
        filters.append(Action.id == cut.action_id)
    if cut.type is not None:
        filters.append(Action.type == cut.type)
    if cut.tag is not None:
        filters.append(Action.topics.any(ActionTopic.topic == cut.tag))
    return filters


def alone_girls_query() -> Select[Girl, Any]:
    """Quem chegou sozinha: tem conta e nunca foi inscrita em nenhuma ação (RN-60).

    Não depende do grupo nem do recorte: ela não tem ação (suposição da #380).
    Quem foi a uma ação deixa de ser "sozinha" (RF-F24.31). Quem apagou a conta
    perde o vínculo com `users` e não entra (RN-12).
    """
    return (
        select(Girl, City.name)
        .outerjoin(City, City.id == Girl.city_ibge_code)
        .where(
            Girl.user_id.is_not(None),
            ~exists().where(Participation.girl_id == Girl.id),
        )
        .order_by(Girl.id)
    )


async def cut_options(session: AsyncSession, group_id: int) -> CutOptions:
    """O que ela pode escolher em "Período" e "Ação": só o que é do grupo."""
    actions = (
        await session.scalars(
            select(Action)
            .where(Action.group_id == group_id)
            .order_by(Action.starts_on.desc(), Action.id)
        )
    ).all()
    return CutOptions(
        years=sorted({a.starts_on.year for a in actions}, reverse=True),
        actions=[ActionOption(a.id, a.name, a.starts_on) for a in actions],
    )


async def action_is_of_group(
    session: AsyncSession, group_id: int, action_id: int
) -> bool:
    found = await session.scalar(
        select(Action.id).where(Action.id == action_id, Action.group_id == group_id)
    )
    return found is not None


async def summarize(
    session: AsyncSession, group_id: int, cut: ExportCut
) -> ExportSummary:
    """Linhas, meninas, ações e quem chegou sozinha do arquivo desse recorte."""
    filters = cut_filters(group_id, cut)
    rows, girls = (
        await session.execute(
            select(
                func.count(Participation.id),
                func.count(distinct(Participation.girl_id)),
            )
            .join(Action, Action.id == Participation.action_id)
            .where(*filters)
        )
    ).one()
    actions = await session.scalar(select(func.count(Action.id)).where(*filters))
    # Quem chegou sozinha tem uma linha e um código, como as outras (RF-F24.31).
    alone = await session.scalar(
        select(func.count()).select_from(alone_girls_query().subquery())
    )
    alone = alone or 0
    return ExportSummary(
        rows=rows + alone, girls=girls + alone, alone=alone, actions=actions or 0
    )


def attendance_cell(action: Action, participation: Participation) -> str:
    """ "sim" se ela veio, "não" se faltou, vazio se a presença ainda não foi anotada."""
    if participation.attended_at is not None:
        return "sim"
    return "não" if action.attendance_registered_at is not None else ""


def comparison_cell(action: Action, participation: Participation) -> str:
    """ "participante" ou "não compareceu". Quem chegou sozinha não passa por aqui."""
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
    in_group = (
        select(Participation.girl_id)
        .join(Action, Action.id == Participation.action_id)
        .where(Action.group_id == group_id)
    )
    # Quem chegou sozinha também tem linha no arquivo, então conta na área.
    alone = alone_girls_query().with_only_columns(Girl.id).order_by(None)
    enrollments = await session.scalars(
        select(Enrollment)
        .where(Enrollment.girl_id.in_(in_group) | Enrollment.girl_id.in_(alone))
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
    cut: ExportCut = NO_CUT,
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
        .where(*cut_filters(group_id, cut))
        .options(selectinload(Action.topics))
        .order_by(Action.starts_on, Action.id, Participation.id)
    )
    alone_total = (await summarize(session, group_id, cut)).alone
    if limit is not None and alone_total:
        # A Revisão mostra ao menos uma de quem chegou sozinha entre as linhas.
        query = query.limit(max(limit - 1, 0))
    elif limit is not None:
        query = query.limit(limit)
    found = list((await session.execute(query)).all())
    alone_query = alone_girls_query()
    if limit is not None:
        alone_query = alone_query.limit(limit - len(found))
    alone_found = list((await session.execute(alone_query)).all())
    girl_ids = {girl.id for _, _, girl, _ in found} | {g.id for g, _ in alone_found}

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
    is_alone: list[bool] = []
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
        is_alone.append(False)

    # Quem chegou sozinha: grupo "sozinha" e as colunas da ação vazias (RN-60).
    for girl, city_name in alone_found:
        entry = entries.get(girl.id)
        values = {
            "code": new_code(taken),
            "age_band": age_band(girl.birth_date, today),
            "city": city_name or "",
            "study_stage": STUDY_STAGE_LABELS[girl.study_stage]
            if girl.study_stage
            else "",
            "comparison": "sozinha",
            "entered": "sim" if entry else "não",
            "entry_level": entry[0] if entry else "",
            "entry_area": entry[1] if entry else "",
            **{
                key: interest.get(girl.id, {}).get(key, "")
                for key in ("interest_signup", *INTEREST_KEYS.values())
            },
        }
        rows.append([values.get(column.key, "") for column in columns])
        is_alone.append(True)

    return ExportTable(columns, rows, is_alone)


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


def file_name(group_name: str, day: date, model: ExportModel | None = None) -> str:
    """O modelo vai no meio do nome; sem modelo vale "Do meu jeito" (D-104)."""
    name = MODEL_SLUGS[model or ExportModel.MY_WAY]
    return f"{slugify(group_name)}_{name}_{day.isoformat()}.csv"


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
    packages: Iterable[Package] | None = None,
    cut: ExportCut = NO_CUT,
    model: ExportModel | None = None,
) -> DataExport:
    """Gera o CSV do grupo (no recorte) e registra a exportação (RN-07)."""
    if now is None:
        now = datetime.now(UTC)
    await purge_old_files(session, now)

    group = await session.get(Group, group_id)
    assert group is not None  # a coordenadora vem de GroupCoordinator

    # Sem `packages`, valem os do modelo; sem modelo, os de "Do meu jeito" (D-104).
    chosen = packages if packages is not None else packages_of(model)
    table = await build_table(session, group_id, today, packages=chosen, cut=cut)
    export = DataExport(
        group_id=group_id,
        user_id=user_id,
        filename=file_name(group.name, today, model),
        model=(model or ExportModel.MY_WAY).value,
        row_count=len(table.rows),
        column_count=len(table.columns),
        content=to_csv(table),
        cut=cut.as_json(),
        expires_at=now + LINK_LIFETIME,
    )
    session.add(export)
    await session.commit()
    return export


# Quantos itens o painel "Histórico de exportações" traz. Decisão assumida na
# #376 (o doc e o Figma não dizem): as 20 mais recentes.
HISTORY_LIMIT = 20

# Sem nenhum filtro no recorte, o arquivo é o de todas as ações do grupo. O modelo
# (#379) ainda não existe.
ALL_ACTIONS_LABEL = "todas as ações"


def cut_label(
    cut: dict[str, int | str | None] | None,
    action_name: str | None,
    model: str | None = None,
) -> str:
    """O modelo e o recorte em texto: "Pesquisa · Oficina · 2026" (RF-F24.07).

    Sem nenhum filtro vira "todas as ações". Exportação de antes dos modelos
    (`model` nulo) não leva o nome do modelo.
    """
    filters: list[str] = []
    if action_name:
        filters.append(action_name)
    if cut and cut.get("type"):
        filters.append(ACTION_TYPE_LABELS[ActionType(str(cut["type"]))])
    if cut and cut.get("tag"):
        filters.append(TOPIC_LABELS[Topic(str(cut["tag"]))])
    if cut and cut.get("year"):
        filters.append(str(cut["year"]))
    parts = [MODEL_NAMES[ExportModel(model)]] if model else []
    return " · ".join([*parts, *filters] if filters else [*parts, ALL_ACTIONS_LABEL])


@dataclass(frozen=True)
class HistoryItem:
    id: int
    who: str
    created_at: datetime
    cut: str
    row_count: int


def _cut_action_id(cut: dict[str, int | str | None] | None) -> int | None:
    value = cut.get("action_id") if cut else None
    return int(value) if value else None


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
    pairs = rows.all()
    # Nome das ações escolhidas, numa consulta só.
    action_ids = {
        action_id
        for export, _ in pairs
        if (action_id := _cut_action_id(export.cut)) is not None
    }
    action_names: dict[int, str] = {}
    if action_ids:
        found = await session.execute(
            select(Action.id, Action.name).where(Action.id.in_(action_ids))
        )
        action_names = {action_id: name for action_id, name in found.all()}
    return [
        HistoryItem(
            id=export.id,
            # Só o primeiro nome, como no Figma ("Kátia").
            who=name.split()[0] if name and name.split() else "Coordenadora",
            created_at=export.created_at,
            cut=cut_label(
                export.cut,
                action_names.get(_cut_action_id(export.cut) or 0),
                export.model,
            ),
            row_count=export.row_count,
        )
        for export, name in pairs
    ]
