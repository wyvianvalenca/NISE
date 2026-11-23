"""Exportação anônima dos dados do grupo (F24, #375).

Só as colunas da Base por enquanto (RF-F24.08): o resto vem nas histórias
seguintes. O código da menina é sorteado a cada exportação e nunca sai de um
dado dela (RN-09); data de nascimento vira faixa e datas viram mês e ano
(RF-F24.04). Nome, e-mail, telefone, escola e texto livre nem são lidos.
"""

import csv
import io
import secrets
import unicodedata
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.actions.models import Action, Participation
from app.modules.catalog.utils import ACTION_TYPE_LABELS
from app.modules.cities.models import City
from app.modules.exports.models import DataExport
from app.modules.girls.models import Girl
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS, age_on
from app.modules.groups.models import Group

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


@dataclass(frozen=True)
class Column:
    key: str
    label: str
    kind: ColumnKind


# As colunas da Base, na ordem do arquivo (RF-F24.08).
BASE_COLUMNS: tuple[Column, ...] = (
    Column("code", "código", "code"),
    Column("age_band", "faixa etária", "generalized"),
    Column("city", "município", "action"),
    Column("study_stage", "etapa escolar", "action"),
    Column("type", "tipo", "action"),
    Column("tags", "tags", "action"),
    Column("action_month", "mês", "generalized"),
    Column("action_name", "ação", "action"),
)


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


async def build_table(
    session: AsyncSession,
    group_id: int,
    today: date,
    limit: int | None = None,
) -> ExportTable:
    """Uma linha por menina e ação, só das ações do grupo (RF-F24.01, RN-07).

    Quem apagou a conta não tem mais inscrição no banco, então não aparece
    (RN-12). Com `limit`, devolve só as primeiras linhas, para a Revisão.
    """
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

    codes: dict[int, str] = {}
    taken: set[str] = set()
    rows: list[list[str]] = []
    for participation, action, girl, city_name in await session.execute(query):
        if girl.id not in codes:
            codes[girl.id] = new_code(taken)
        stage = participation.study_stage or girl.study_stage
        rows.append(
            [
                codes[girl.id],
                age_band(girl.birth_date, today),
                city_name or "",
                STUDY_STAGE_LABELS[stage] if stage else "",
                ACTION_TYPE_LABELS[action.type],
                ", ".join(sorted(TOPIC_LABELS[tag.topic] for tag in action.topics)),
                month_of(action.starts_on),
                action.name,
            ]
        )

    return ExportTable(BASE_COLUMNS, rows)


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
) -> DataExport:
    """Gera o CSV do grupo e registra a exportação (RN-07)."""
    if now is None:
        now = datetime.now(UTC)
    await purge_old_files(session, now)

    group = await session.get(Group, group_id)
    assert group is not None  # a coordenadora vem de GroupCoordinator

    table = await build_table(session, group_id, today)
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
