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
    CompoundSelect,
    Select,
    exists,
    extract,
    func,
    select,
    union,
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
from app.modules.admissions.models import AdmissionOrigin, CourseLevel, Enrollment
from app.modules.answers.models import Answer, AnswerStage
from app.modules.catalog.utils import ACTION_TYPE_LABELS
from app.modules.cities.models import City
from app.modules.exports.models import DataExport
from app.modules.followup.models import (
    ComputingView,
    CourseCode,
    FollowupAnswer,
    FollowupRound,
)
from app.modules.followup.utils import COURSE_LABELS
from app.modules.girls.models import Girl, Topic
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS, age_on
from app.modules.groups.models import Group
from app.users.models import User

# O link vale 15 minutos e o texto do arquivo some do servidor em 24 horas.
LINK_LIFETIME = timedelta(minutes=15)
FILE_LIFETIME = timedelta(hours=24)

# Quantas linhas o passo "Revisão" mostra (RF-F24.32).
PREVIEW_ROWS = 5

# O arquivo sai em UTF-8 com BOM e separador ";", como pede a RF-F24.34. O BOM
# faz Excel e Sheets acertarem os acentos. Limite conhecido (revisão da #431):
# o Excel separa as colunas pelo separador de lista do Windows, então numa
# máquina configurada com "," ele abre tudo na coluna A.
BOM = "\ufeff"
CSV_DELIMITER = ";"
CSV_ENCODING = "utf-8"
CSV_MEDIA_TYPE = "text/csv; charset=utf-8"

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


# Tudo ligado, menos "Outros grupos" (RF-F24.15): os pacotes do modelo "Pesquisa".
# Sem modelo nem pacotes, vale "Do meu jeito", só a Base (`packages_of`, D-104).
RESEARCH_PACKAGES: tuple[Package, ...] = (
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

# Pacotes que cada modelo já marca (RF-F24.10). "Pesquisa" é "todos os pacotes"
# menos "Outros grupos", que vem desligado (RF-F24.15, Figma A2). "Do meu jeito"
# começa sem pacotes: ela escolhe um por um.
MODEL_PACKAGES: dict[ExportModel, tuple[Package, ...]] = {
    ExportModel.ACCOUNTABILITY: (Package.FUNNEL, Package.RATINGS),
    ExportModel.RESEARCH: RESEARCH_PACKAGES,
    ExportModel.PLANNING: (Package.RATINGS, Package.INTEREST),
    ExportModel.MY_WAY: (),
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

# Os cursos da lista do questionário e do perfil. No ingresso que ela declarou,
# qualquer outro nome é o que ela digitou em "Outro curso": texto livre, que
# nunca sai (RN-11). Os cursos das listas oficiais vêm da instituição e saem.
LISTED_COURSES = frozenset(COURSE_LABELS.values())
OTHER_COURSE = COURSE_LABELS[CourseCode.OUTRO]

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
    """O resumo do arquivo conforme o recorte (RF-F24.33).

    `no_action` é quantas meninas sem ação entram; é 0 quando elas não entram
    (D-106).
    """

    rows: int
    girls: int
    no_action: int
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
    # Uma marca por linha: a linha é de uma menina sem ação (a Revisão a pinta).
    no_action: list[bool]


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


def no_action_filters(group_id: int) -> list[ColumnElement[bool]]:
    """A menina sem ação: tem conta e não esteve presente em nenhuma ação (D-105).

    O que conta é a presença, não a inscrição: ela deixa de ser "sem ação" a
    partir da primeira presença (RF-F24.31). Inscrita só em ações que ainda não
    foram concluídas, ela continua sem ação. Não é o mesmo que "chegou sozinha",
    que é a origem dela e não muda (RN-32, D-110).

    Presença em ação de qualquer grupo tira a menina de "sem ação": é como o
    código já fazia; o doc ainda não decidiu se valem só as ações do grupo
    (RF-F24.31, RN-07).

    Sem contar duas vezes: quem se inscreveu numa ação já concluída deste grupo e
    ficou sem presença tem a linha "nao_compareceu" dessa ação (RF-F24.08), então
    não ganha também a linha "sem_acao".

    Não depende do recorte: os filtros do primeiro passo não mudam quantas entram
    (D-107). Por isso, se o recorte deixa de fora a ação a que ela faltou, ela não
    tem linha nesse arquivo, como qualquer inscrita de uma ação fora do recorte; o
    aviso da tela diz isso. Quem apagou a conta perde o vínculo com `users` e não
    entra (RN-12).
    """
    went = exists().where(
        Participation.girl_id == Girl.id, Participation.attended_at.is_not(None)
    )
    missed_here = exists().where(
        Participation.girl_id == Girl.id,
        Participation.action_id == Action.id,
        Action.group_id == group_id,
        Action.attendance_registered_at.is_not(None),
    )
    return [Girl.user_id.is_not(None), ~went, ~missed_here]


def no_action_girls_query(group_id: int) -> Select[Girl, Any]:
    """As meninas sem ação, com o município, para as linhas delas no arquivo."""
    return (
        select(Girl, City.name)
        .outerjoin(City, City.id == Girl.city_ibge_code)
        .where(*no_action_filters(group_id))
        .order_by(Girl.id)
    )


def no_action_enters(packages: Iterable[Package]) -> bool:
    """As meninas sem ação só entram com o pacote "Grupos de comparação" (D-106).

    Ele vem marcado em "Pesquisa" e desmarcado em "Do meu jeito", "Prestação de
    contas" e "Planejar a próxima ação" (RF-F24.10).
    """
    return Package.GROUPS in set(packages)


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


async def count_rows(
    session: AsyncSession, query: Select[Any] | CompoundSelect[Any]
) -> int:
    """Quantas linhas a consulta devolve."""
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    return total or 0


async def summarize(
    session: AsyncSession,
    group_id: int,
    cut: ExportCut,
    packages: Iterable[Package] = RESEARCH_PACKAGES,
) -> ExportSummary:
    """Linhas, meninas, ações e meninas sem ação do arquivo desse recorte.

    `packages` diz se as meninas sem ação entram (D-106).
    """
    filters = cut_filters(group_id, cut)
    in_actions = (
        select(Participation.girl_id)
        .join(Action, Action.id == Participation.action_id)
        .where(*filters)
    )
    rows = await count_rows(session, in_actions)
    actions = await session.scalar(select(func.count(Action.id)).where(*filters))
    if not no_action_enters(packages):
        girls = await count_rows(session, in_actions.distinct())
        return ExportSummary(rows, girls, no_action=0, actions=actions or 0)

    # Cada menina sem ação tem uma linha, como as outras (RF-F24.31). Quem está
    # inscrita numa ação ainda não concluída tem a linha da ação e a linha sem
    # ação, mas é uma menina só, com um código só (RF-F24.03): o `union` tira a
    # repetida.
    no_action_ids = select(Girl.id).where(*no_action_filters(group_id))
    no_action = await count_rows(session, no_action_ids)
    girls = await count_rows(session, union(in_actions, no_action_ids))
    return ExportSummary(
        rows=rows + no_action, girls=girls, no_action=no_action, actions=actions or 0
    )


def attendance_cell(action: Action, participation: Participation) -> str:
    """ "sim" se ela veio, "não" se faltou, vazio se a presença ainda não foi anotada."""
    if participation.attended_at is not None:
        return "sim"
    return "não" if action.attendance_registered_at is not None else ""


def comparison_cell(action: Action, participation: Participation) -> str:
    """ "participante" ou "nao_compareceu" (RF-F24.08, D-105).

    "nao_compareceu" é a inscrita sem presença numa ação já concluída. A linha
    "sem_acao" não passa por aqui.
    """
    return {"sim": "participante", "não": "nao_compareceu"}.get(
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
    session: AsyncSession,
    group_id: int,
    cut: ExportCut,
    girl_ids: set[int],
    with_no_action: bool,
) -> dict[int, tuple[str, str]]:
    """Nível e área do ingresso mais recente de cada menina (nunca a instituição).

    O curso que ela digitou em "Outro curso" sai como "Outro curso" (RN-11).
    Área com menos de 5 meninas no arquivo vira "TI (agrupado)" (RF-F24.35). A
    contagem usa as meninas do recorte `cut` (as mesmas das linhas do arquivo),
    não o grupo todo nem só as linhas da Revisão.
    """
    in_cut = (
        select(Participation.girl_id)
        .join(Action, Action.id == Participation.action_id)
        .where(*cut_filters(group_id, cut))
    )
    in_file: ColumnElement[bool] = Enrollment.girl_id.in_(in_cut)
    if with_no_action:
        # As meninas sem ação também têm linha no arquivo, então contam na área.
        no_action = select(Girl.id).where(*no_action_filters(group_id))
        in_file = in_file | Enrollment.girl_id.in_(no_action)
    enrollments = await session.scalars(
        select(Enrollment)
        .where(in_file)
        .order_by(Enrollment.enrolled_on.desc(), Enrollment.id.desc())
    )
    latest: dict[int, Enrollment] = {}
    for enrollment in enrollments:
        latest.setdefault(enrollment.girl_id, enrollment)
    areas = {girl_id: area_of(e) for girl_id, e in latest.items()}
    per_area = Counter(areas.values())
    return {
        girl_id: (
            LEVEL_LABELS[e.level],
            area
            if per_area[(area := areas[girl_id])] >= MIN_GIRLS_PER_AREA
            else GROUPED_AREA,
        )
        for girl_id, e in latest.items()
        if girl_id in girl_ids
    }


def area_of(enrollment: Enrollment) -> str:
    """A área como sai no arquivo: o curso digitado vira "Outro curso" (RN-11)."""
    if (
        enrollment.origin is AdmissionOrigin.SELF_DECLARED
        and enrollment.course not in LISTED_COURSES
    ):
        return OTHER_COURSE
    return enrollment.course


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
    packages: Iterable[Package] = RESEARCH_PACKAGES,
    cut: ExportCut = NO_CUT,
) -> ExportTable:
    """Uma linha por menina e ação, só das ações do grupo (RF-F24.01, RN-07).

    Quem apagou a conta não tem mais inscrição no banco, então não aparece
    (RN-12). Com `limit`, devolve só as primeiras linhas, para a Revisão. A
    Base sempre vem; `packages` diz quais pacotes entram (RF-F24.08) e se as
    meninas sem ação entram (D-106), no fim, uma linha cada (RF-F24.31).
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
    no_action_total = (await summarize(session, group_id, cut, chosen)).no_action
    if limit is not None and no_action_total:
        # A Revisão mostra ao menos uma menina sem ação entre as linhas.
        query = query.limit(max(limit - 1, 0))
    elif limit is not None:
        query = query.limit(limit)
    found = list((await session.execute(query)).all())
    no_action_found: list[Any] = []
    if no_action_total:
        no_action_query = no_action_girls_query(group_id)
        if limit is not None:
            no_action_query = no_action_query.limit(limit - len(found))
        no_action_found = list((await session.execute(no_action_query)).all())
    girl_ids = {girl.id for _, _, girl, _ in found} | {g.id for g, _ in no_action_found}

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
        await entry_by_girl(session, group_id, cut, girl_ids, no_action_enters(chosen))
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
    is_no_action: list[bool] = []
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
        is_no_action.append(False)

    # TODO RF-F24.36: anonimização mais forte para as linhas sem_acao (Should, a validar).
    # A menina sem ação: "sem_acao" e as colunas da ação vazias (RF-F24.31,
    # RN-60). Quem está inscrita numa ação ainda não concluída já tem código da
    # linha da ação e fica com ele, porque o código é o mesmo dentro do arquivo
    # (RF-F24.03).
    for girl, city_name in no_action_found:
        if girl.id not in codes:
            codes[girl.id] = new_code(taken)
        entry = entries.get(girl.id)
        values = {
            "code": codes[girl.id],
            "age_band": age_band(girl.birth_date, today),
            "city": city_name or "",
            "study_stage": STUDY_STAGE_LABELS[girl.study_stage]
            if girl.study_stage
            else "",
            "comparison": "sem_acao",
            "entered": "sim" if entry else "não",
            "entry_level": entry[0] if entry else "",
            "entry_area": entry[1] if entry else "",
            **{
                key: interest.get(girl.id, {}).get(key, "")
                for key in ("interest_signup", *INTEREST_KEYS.values())
            },
        }
        rows.append([values.get(column.key, "") for column in columns])
        is_no_action.append(True)

    return ExportTable(columns, rows, is_no_action)


def to_csv(table: ExportTable) -> str:
    """O texto do arquivo: BOM e separador ";" (RF-F24.34).

    Célula com ";", quebra de linha ou aspas vai entre aspas. Para baixar, o
    texto vira bytes com `CSV_ENCODING`.
    """
    out = io.StringIO()
    writer = csv.writer(out, delimiter=CSV_DELIMITER, lineterminator="\r\n")
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
