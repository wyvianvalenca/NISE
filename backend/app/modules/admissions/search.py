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
from sqlalchemy import func, select
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

# Chave do pg_try_advisory_xact_lock que impede duas rodadas de gravar juntas.
# Qualquer número fixo serve, desde que só a busca use.
ROUND_LOCK_KEY = 310_273


class SearchDisabledError(Exception):
    """A busca está desligada (LIST_SEARCH_ENABLED), à espera do Comitê de Ética."""


class RoundRunningError(Exception):
    """Outra rodada está gravando agora. Esta para sem gravar nada."""


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


async def _lock_round(session: AsyncSession) -> None:
    """Uma rodada grava por vez (RNF-F31.05).

    O lock vale até o commit da gravação. Sem ele, duas rodadas juntas
    inseririam a mesma chamada e a segunda pararia com IntegrityError.
    """
    locked = await session.scalar(
        select(func.pg_try_advisory_xact_lock(ROUND_LOCK_KEY))
    )
    if not locked:
        raise RoundRunningError


async def run_copeve_round(
    session: AsyncSession,
    client: httpx2.AsyncClient,
    courses: Iterable[int] = TARGET_COURSES,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    now: datetime | None = None,
) -> RoundResult:
    """Roda a busca nos cursos pedidos e devolve só contagens.

    `courses` permite dividir a rodada em partes, um curso por vez, quando ela
    não cabe no limite de duração da hospedagem. Levanta ReportFormatError,
    ReportUnavailableError ou RoundRunningError sem ter gravado nada, e
    SearchDisabledError sem consultar nada.
    """
    # RN-20: só compara nomes com listas oficiais depois do Comitê de Ética.
    if not settings.list_search_enabled:
        raise SearchDisabledError

    courses = list(courses)
    if any(course not in TARGET_COURSES for course in courses):
        raise ValueError("Só cursos-alvo (RF-F31.02)")

    by_name = await _girls_by_name(session)
    # Fecha a transação de leitura: as consultas levam uns 2 minutos, e a
    # conexão não precisa ficar presa esse tempo todo.
    await session.rollback()
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

    await _lock_round(session)

    created = 0
    # Os cursos 6 e 7 são os dois "Ciência da Computação": a mesma menina pode
    # vir nos dois, para a mesma chamada. Um indício só por menina e chamada,
    # sem depender do autoflush dentro de create_match.
    saved: set[tuple[int, int]] = set()
    for girl_id, course, call in sorted(found):
        official_list = await _official_list(session, call)
        if (girl_id, official_list.id) in saved:
            continue
        saved.add((girl_id, official_list.id))
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
