"""A rodada da busca em listas oficiais (RF-F31.07, #273, #274).

Há duas fontes: o relatório da COPEVE (UFAL) e os PDFs de convocação do IFAL.
Uma rodada da COPEVE consulta cada curso-alvo em cada modalidade de demanda, uma
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
from app.modules.admissions.ifal import (
    TargetCourse,
    download_url,
    fetch_documents,
    fetch_pdf,
    is_convocation,
    is_other_course,
    parse_convocation,
)
from app.modules.admissions.models import CourseLevel, ListSearchRun, OfficialList
from app.modules.admissions.service import create_match
from app.modules.cities.utils import normalize_search
from app.modules.girls.models import Girl

# Os logs só levam contagens e códigos de curso, nunca um nome (RNF-F31.01).
logger = logging.getLogger(__name__)

COPEVE_INSTITUTION = "UFAL"
IFAL_INSTITUTION = "IFAL"

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


async def _official_list(
    session: AsyncSession, institution: str, selection_process: str, call: str, url: str
) -> OfficialList:
    """A chamada da lista, criada na primeira vez que aparece."""
    official_list = await session.scalar(
        select(OfficialList).where(
            OfficialList.institution == institution,
            OfficialList.selection_process == selection_process,
            OfficialList.call == call,
        )
    )
    if official_list is None:
        official_list = OfficialList(
            institution=institution,
            selection_process=selection_process,
            call=call,
            url=url,
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


@dataclass(frozen=True)
class _Found:
    """Uma menina achada numa chamada: o resto da lista não sai da rodada."""

    girl_id: int
    selection_process: str
    call: str
    url: str
    course: str
    level: CourseLevel


async def _save_matches(
    session: AsyncSession,
    institution: str,
    found: Iterable[_Found],
    now: datetime | None,
) -> int:
    """Grava os indícios no fim da rodada e devolve quantos são novos.

    create_match não repete o indício de quem já tem indício, aprovação,
    ingresso ou a marca de dispensado para a chamada (RF-F31.06). Só uma
    rodada grava por vez (_lock_round).
    """
    await _lock_round(session)

    created = 0
    # Os cursos 6 e 7 da COPEVE são os dois "Ciência da Computação", e a mesma
    # menina pode vir em dois cursos da mesma chamada. Um indício só por menina
    # e chamada, sem depender do autoflush dentro de create_match.
    saved: set[tuple[int, str, str]] = set()
    for item in sorted(found, key=lambda f: (f.girl_id, f.selection_process, f.call)):
        key = (item.girl_id, item.selection_process, item.call)
        if key in saved:
            continue
        saved.add(key)
        official_list = await _official_list(
            session, institution, item.selection_process, item.call, item.url
        )
        match = await create_match(
            session, item.girl_id, official_list, item.course, item.level, now
        )
        if match is not None:
            created += 1
    return created


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

    created = await _save_matches(
        session,
        COPEVE_INSTITUTION,
        (
            _Found(
                girl_id=girl_id,
                selection_process=settings.copeve_selection_process,
                call=call,
                url=settings.copeve_public_url,
                course=TARGET_COURSES[course],
                level=CourseLevel.GRADUACAO,
            )
            for girl_id, course, call in found
        ),
        now,
    )

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


async def run_ifal_round(
    session: AsyncSession,
    client: httpx2.AsyncClient,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    now: datetime | None = None,
) -> RoundResult:
    """Roda a busca nas listas de convocação do IFAL (RF-F31.12, #274).

    Para cada seleção configurada, lista os documentos, baixa só os que pelo
    título são listas de convocação e compara os nomes dos cursos-alvo, do
    mesmo jeito que a COPEVE. Cada PDF é lido em memória e descartado antes do
    próximo. Levanta ReportFormatError, ReportUnavailableError ou
    RoundRunningError sem ter gravado nada (RNF-F31.04), e SearchDisabledError
    sem consultar nada.
    """
    # RN-20: só compara nomes com listas oficiais depois do Comitê de Ética.
    if not settings.list_search_enabled:
        raise SearchDisabledError

    api_url = settings.ifal_api_url.rstrip("/")
    targets = [
        TargetCourse(course=course, campus=campus)
        for course, campus in settings.ifal_target_courses
    ]
    by_name = await _girls_by_name(session)
    # Fecha a transação de leitura antes dos downloads (veja run_copeve_round).
    await session.rollback()
    found: set[_Found] = set()
    queries = rows_read = 0

    async def request_slot() -> None:
        # Uma requisição a cada 2 s, contando listagens e downloads (RNF-F31.05).
        nonlocal queries
        if queries:
            await sleep(settings.list_search_interval_seconds)
        queries += 1

    for selection, selection_process in settings.ifal_selections.items():
        await request_slot()
        documents = await fetch_documents(client, api_url, selection)
        for document in documents:
            if not is_convocation(document.title):
                continue
            if is_other_course(document.title, targets):
                continue
            url = download_url(api_url, selection, document.id)
            await request_slot()
            pdf = await fetch_pdf(client, url, settings.ifal_max_pdf_bytes)
            # O pypdf leva tempo num PDF grande (até 15 MB): numa thread, para
            # não travar as outras requisições do servidor enquanto lê.
            convocation = await asyncio.to_thread(
                parse_convocation, pdf, document.title, targets
            )
            del pdf
            rows_read += convocation.rows_read
            for convoked in convocation.convoked:
                for girl_id in by_name.get(convoked.name, []):
                    found.add(
                        _Found(
                            girl_id=girl_id,
                            selection_process=selection_process,
                            # O título do documento é a chamada: outro documento
                            # da seleção pode gerar indício de novo (RF-F31.06).
                            call=document.title,
                            url=url,
                            course=convoked.course.course,
                            level=CourseLevel.GRADUACAO,
                        )
                    )

    created = await _save_matches(session, IFAL_INSTITUTION, found, now)

    session.add(
        ListSearchRun(
            source="ifal",
            selection_process=", ".join(settings.ifal_selections.values()),
            url=api_url,
            courses=",".join(f"{t.course} ({t.campus})" for t in targets),
            queries=queries,
            rows_read=rows_read,
            matches_created=created,
        )
    )
    await session.commit()

    logger.info(
        "Busca no IFAL: %s requisições, %s linhas lidas, %s indícios novos",
        queries,
        rows_read,
        created,
    )
    return RoundResult(queries=queries, rows_read=rows_read, matches_created=created)
