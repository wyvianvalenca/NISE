"""A rodada da busca em listas oficiais (RF-F31.07, #273).

Uma rodada consulta cada curso-alvo em cada modalidade de demanda, uma
consulta de cada vez, compara os nomes chamados com as contas pelo nome
completo normalizado (RF-F31.03) e só no fim grava os indícios. Se qualquer
consulta falhar ou a página mudar de formato, nada é gravado (RNF-F31.04).
"""

import asyncio
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from datetime import datetime

import httpx2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.admissions.copeve import (
    DEMANDS,
    TARGET_COURSES,
    fetch_report,
    parse_report,
)
from app.modules.admissions.models import CourseLevel, ListSearchRun, OfficialList
from app.modules.admissions.service import create_match
from app.modules.cities.utils import normalize_search
from app.modules.girls.models import Girl

# Os logs só levam contagens e códigos de curso, nunca um nome (RNF-F31.01).
logger = logging.getLogger(__name__)

COPEVE_INSTITUTION = "UFAL"


@dataclass(frozen=True)
class RoundResult:
    queries: int
    rows_read: int
    matches_created: int


async def _girls_by_name(session: AsyncSession) -> dict[str, list[int]]:
    """Nome normalizado → meninas com conta. Homônimas recebem o indício as duas."""
    rows = await session.execute(
        select(Girl.id, Girl.name).where(Girl.user_id.is_not(None))
    )
    by_name: dict[str, list[int]] = defaultdict(list)
    for girl_id, name in rows:
        by_name[normalize_search(name)].append(girl_id)
    return by_name


async def _official_list(session: AsyncSession, call: str) -> OfficialList:
    """A chamada da lista, criada na primeira vez que aparece."""
    selection = settings.copeve_selection_process
    official_list = await session.scalar(
        select(OfficialList).where(
            OfficialList.institution == COPEVE_INSTITUTION,
            OfficialList.selection_process == selection,
            OfficialList.call == call,
        )
    )
    if official_list is None:
        official_list = OfficialList(
            institution=COPEVE_INSTITUTION,
            selection_process=selection,
            call=call,
            url=settings.copeve_public_url,
        )
        session.add(official_list)
        await session.flush()
    return official_list


async def run_copeve_round(
    session: AsyncSession,
    client: httpx2.AsyncClient,
    courses: Iterable[int] = TARGET_COURSES,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    now: datetime | None = None,
) -> RoundResult:
    """Roda a busca nos cursos pedidos e devolve só contagens.

    `courses` permite dividir a rodada em partes, um curso por vez, quando ela
    não cabe no limite de duração da hospedagem. Levanta ReportFormatError ou
    ReportUnavailableError sem ter gravado nada.
    """
    courses = list(courses)
    if any(course not in TARGET_COURSES for course in courses):
        raise ValueError("Só cursos-alvo (RF-F31.02)")

    by_name = await _girls_by_name(session)
    # (menina, curso, chamada): o resto da página não sai daqui.
    found: set[tuple[int, int, str]] = set()
    queries = rows_read = 0

    for course in courses:
        for demand in DEMANDS:
            if queries:
                await sleep(settings.list_search_interval_seconds)
            html = await fetch_report(
                client, settings.copeve_report_url, course, demand
            )
            report = parse_report(html)
            del html
            queries += 1
            rows_read += report.rows_read
            for called in report.called:
                for girl_id in by_name.get(called.name, []):
                    found.add((girl_id, course, called.call))

    created = 0
    for girl_id, course, call in sorted(found):
        official_list = await _official_list(session, call)
        match = await create_match(
            session,
            girl_id,
            official_list,
            TARGET_COURSES[course],
            CourseLevel.GRADUACAO,
            now,
        )
        if match is not None:
            created += 1

    session.add(
        ListSearchRun(
            source="copeve",
            selection_process=settings.copeve_selection_process,
            url=settings.copeve_report_url,
            courses=",".join(str(course) for course in courses),
            queries=queries,
            rows_read=rows_read,
            matches_created=created,
        )
    )
    await session.commit()

    logger.info(
        "Busca na COPEVE: %s consultas, %s linhas lidas, %s indícios novos",
        queries,
        rows_read,
        created,
    )
    return RoundResult(queries=queries, rows_read=rows_read, matches_created=created)
