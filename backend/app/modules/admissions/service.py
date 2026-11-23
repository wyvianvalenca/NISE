from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, Select, exists, func, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.config import settings
from app.modules.actions.models import Action, Participation
from app.modules.admissions.exceptions import (
    MatchAlreadyAnsweredError,
    MatchNotFoundError,
)
from app.modules.admissions.match_email import queue_match_email
from app.modules.admissions.models import (
    AdmissionOrigin,
    Approval,
    CourseLevel,
    DismissedMatch,
    Enrollment,
    ListMatch,
    ListSearchRun,
    OfficialList,
)
from app.modules.admissions.schemas import (
    EnrollmentSummaryOut,
    LevelSummaryOut,
    ListSearchOut,
    MatchAnswerIn,
    MatchResult,
    RecentFoundOut,
    RecentGirlOut,
)
from app.modules.admissions.utils import add_months
from app.modules.girls.models import Girl

# Sem resposta nesse prazo, o indício é apagado (RF-F31.06).
MATCH_DAYS = 30

# A data do ingresso é o dia em Maceió, não em UTC.
LOCAL_TIMEZONE = ZoneInfo("America/Maceio")


def _is_open(now: datetime) -> ColumnElement[bool]:
    # Indício sem resposta e ainda dentro do prazo.
    return ListMatch.answered_at.is_(None) & (ListMatch.expires_at > now)


async def create_match(
    session: AsyncSession,
    girl_id: int,
    official_list: OfficialList,
    course: str,
    level: CourseLevel,
    now: datetime | None = None,
) -> ListMatch | None:
    """Cria o indício de uma menina numa chamada, para a busca (#273).

    Devolve None, sem criar nada, se ela já tem para essa chamada um indício,
    a marca de um indício apagado, uma aprovação ou um ingresso: assim a mesma
    chamada nunca gera o indício de novo (RF-F31.06). Põe na fila o e-mail que
    a avisa, se ela aceitou e-mails de oportunidades (RF-F31.11, #275). Não faz
    commit; quem chama grava a rodada inteira de uma vez.
    """
    if now is None:
        now = datetime.now(UTC)

    # Uma chamada nova ainda sem flush tem id vazio, e a checagem abaixo
    # compararia com NULL e não acharia nada.
    if official_list.id is None:
        await session.flush()
    list_id = official_list.id
    already_known = select(
        or_(
            exists().where(
                ListMatch.girl_id == girl_id, ListMatch.official_list_id == list_id
            ),
            exists().where(
                DismissedMatch.girl_id == girl_id,
                DismissedMatch.official_list_id == list_id,
            ),
            exists().where(
                Approval.girl_id == girl_id, Approval.official_list_id == list_id
            ),
            exists().where(
                Enrollment.girl_id == girl_id, Enrollment.official_list_id == list_id
            ),
        )
    )
    if await session.scalar(already_known):
        return None

    match = ListMatch(
        girl_id=girl_id,
        official_list=official_list,
        course=course,
        level=level,
        expires_at=now + timedelta(days=MATCH_DAYS),
    )
    session.add(match)
    await queue_match_email(session, match)

    return match


async def open_matches_of_girl(
    session: AsyncSession, girl_id: int, now: datetime | None = None
) -> Sequence[ListMatch]:
    """Os indícios sem resposta da própria menina, com a chamada carregada.

    Só para rotas da própria menina: traz lista, curso e instituição, que
    ninguém mais pode ver (RNF-F31.02).
    """
    if now is None:
        now = datetime.now(UTC)

    statement = (
        select(ListMatch)
        .where(ListMatch.girl_id == girl_id, _is_open(now))
        .options(selectinload(ListMatch.official_list))
        .order_by(ListMatch.created_at, ListMatch.id)
    )
    result = await session.scalars(statement)

    return result.all()


async def girl_has_open_match(
    session: AsyncSession, girl_id: int, now: datetime | None = None
) -> bool:
    """Diz só se existe um indício sem resposta, sem nenhum detalhe dele.

    Para as rotas da própria menina, como a agenda (#266). A coordenadora não
    recebe nem isto até a menina confirmar (RN-21, RNF-F31.02): o fato da C5
    (RF-F5.10) fica para o PR do painel dela (#137), depois da validação do M7.
    """
    if now is None:
        now = datetime.now(UTC)

    statement = select(exists().where(ListMatch.girl_id == girl_id, _is_open(now)))

    return bool(await session.scalar(statement))


async def dismiss_match(session: AsyncSession, match: ListMatch) -> None:
    """Apaga o indício e deixa só a marca (menina e chamada), RF-F31.06.

    Não faz commit.
    """
    session.add(
        DismissedMatch(girl_id=match.girl_id, official_list_id=match.official_list_id)
    )
    await session.delete(match)


async def delete_expired_matches(
    session: AsyncSession, now: datetime | None = None
) -> int:
    """Apaga os indícios sem resposta há 30 dias e devolve quantos foram.

    Chamada uma vez por dia pela rotina da busca (#273).
    """
    if now is None:
        now = datetime.now(UTC)

    # skip_locked: se ela está respondendo "Sou eu" agora, a resposta segura o
    # indício e a rotina passa por ele. Sem isso, a rotina esperaria a resposta e
    # depois apagaria um indício já respondido, deixando ingresso e marca juntos.
    statement = (
        select(ListMatch)
        .where(ListMatch.answered_at.is_(None), ListMatch.expires_at <= now)
        .with_for_update(skip_locked=True)
    )
    expired = (await session.scalars(statement)).all()

    for match in expired:
        await dismiss_match(session, match)

    await session.commit()

    return len(expired)


async def answer_match(
    session: AsyncSession,
    girl_id: int,
    match_id: int,
    answer: MatchAnswerIn,
    now: datetime | None = None,
) -> MatchResult:
    """Grava a resposta dela na A19 (RF-F31.04, RN-21, RN-22).

    - "Sou eu" + "Já me matriculei": ingresso com a data e a origem da lista.
    - "Sou eu" + "Ainda não": aprovação, não ingresso.
    - "Não sou eu": apaga o indício e deixa só a marca (RF-F31.06).

    Levanta MatchNotFoundError se o indício não é dela, não existe ou venceu, e
    MatchAlreadyAnsweredError se ela já respondeu.
    """
    if now is None:
        now = datetime.now(UTC)

    # FOR UPDATE: duas respostas ao mesmo tempo não gravam dois ingressos.
    match = await session.scalar(
        select(ListMatch)
        .where(ListMatch.id == match_id, ListMatch.girl_id == girl_id)
        .options(selectinload(ListMatch.official_list))
        .with_for_update()
    )

    if match is None or match.expires_at <= now:
        raise MatchNotFoundError

    if match.answered_at is not None:
        raise MatchAlreadyAnsweredError

    if not answer.is_me:
        await dismiss_match(session, match)
        await session.commit()
        return MatchResult.DISMISSED

    institution = match.official_list.institution
    if answer.enrolled:
        session.add(
            Enrollment(
                girl_id=girl_id,
                level=match.level,
                course=match.course,
                institution=institution,
                enrolled_on=now.astimezone(LOCAL_TIMEZONE).date(),
                origin=AdmissionOrigin.OFFICIAL_LIST,
                official_list_id=match.official_list_id,
            )
        )
        result = MatchResult.ENROLLED
    else:
        session.add(
            Approval(
                girl_id=girl_id,
                level=match.level,
                course=match.course,
                institution=institution,
                origin=AdmissionOrigin.OFFICIAL_LIST,
                official_list_id=match.official_list_id,
            )
        )
        result = MatchResult.APPROVED

    match.answered_at = now
    await session.commit()

    return result


async def current_enrollment(session: AsyncSession, girl_id: int) -> Enrollment | None:
    """O curso em que ela está hoje: o ingresso mais recente que ela não deixou.

    Ingresso com `left_on` (ela parou ou trocou de curso, RF-F6.06) não conta,
    mas continua guardado. None se ela nunca registrou um curso ou se deixou
    todos. Serve ao questionário (M5) e ao perfil.
    """
    return await session.scalar(
        select(Enrollment)
        .where(Enrollment.girl_id == girl_id, Enrollment.left_on.is_(None))
        .order_by(Enrollment.created_at.desc(), Enrollment.id.desc())
        .limit(1)
    )


def add_self_declared_enrollment(
    session: AsyncSession,
    girl_id: int,
    level: CourseLevel,
    course: str,
    institution: str | None,
    now: datetime | None = None,
) -> Enrollment:
    """Junta à sessão o ingresso que ela declarou, com a data de hoje (RF-F6.03).

    Não faz commit: quem chama grava junto com as próprias linhas, para a
    declaração ser atômica (RNF-F6.01). `course` e `institution` são texto
    livre quando ela digita: nunca vão para logs (RN-11).
    """
    if now is None:
        now = datetime.now(UTC)

    enrollment = Enrollment(
        girl_id=girl_id,
        level=level,
        course=course,
        institution=institution,
        enrolled_on=now.astimezone(LOCAL_TIMEZONE).date(),
        origin=AdmissionOrigin.SELF_DECLARED,
    )
    session.add(enrollment)

    return enrollment


# ---------------------------------------------------------------------------
# Ingressantes da coordenadora (C8, #315)
# ---------------------------------------------------------------------------

# 15 meninas por página na lista "Quem ingressou" (D-77).
ENROLLMENTS_PAGE_SIZE = 15


def girls_of_group(group_id: int) -> Select[int]:
    """Os ids das meninas que aparecem com nome para o grupo (RN-01, RN-04).

    Ela precisa ter conta, ter vindo pelo convite de algum grupo e ter
    presença registrada numa ação deste grupo. Quem chegou sozinha nunca
    aparece com nome (RN-04). Quem foi a ações de dois grupos aparece nos
    dois (D-61).
    """
    went_to_an_action_of_the_group = exists(
        select(Participation.id)
        .join(Action, Action.id == Participation.action_id)
        .where(
            Participation.girl_id == Girl.id,
            Participation.attended_at.is_not(None),
            Action.group_id == group_id,
        )
    )

    return select(Girl.id).where(
        Girl.user_id.is_not(None),
        Girl.origin_group_id.is_not(None),
        went_to_an_action_of_the_group,
    )


def latest_enrollments(group_id: int) -> type[Enrollment]:
    """O ingresso mais recente de cada menina do grupo, para usar como Enrollment.

    É a base da lista "Quem ingressou" (#315) e do resumo (#316): os dois partem
    das mesmas linhas, e por isso os números batem. Quando ela corrige a
    declaração (RF-F6.05), vale o curso novo. Só ingresso entra; aprovação,
    indício sem resposta e "Não sou eu" não (RN-21, RN-22).
    """
    return aliased(
        Enrollment,
        select(Enrollment)
        .where(Enrollment.girl_id.in_(girls_of_group(group_id)))
        .ext(distinct_on(Enrollment.girl_id))
        .order_by(
            Enrollment.girl_id, Enrollment.created_at.desc(), Enrollment.id.desc()
        )
        .subquery(),
    )


async def list_group_enrollments(
    session: AsyncSession, group_id: int, page: int
) -> tuple[Sequence[tuple[Enrollment, str]], int]:
    """Uma página de "Quem ingressou" e o total de meninas da lista (#315).

    Uma linha por menina, com o ingresso registrado mais recente dela: se ela
    corrigiu a declaração (RF-F6.05), aparece o curso novo. Só ingresso entra;
    aprovação, indício sem resposta e "Não sou eu" não (RN-21, RN-22).

    A ordem é a do registro, das mais recentes para as mais antigas (D-77). O
    id desempata, para a mesma menina não pular de página.
    """
    latest = latest_enrollments(group_id)

    total = await session.scalar(select(func.count()).select_from(latest))

    statement = (
        select(latest, Girl.name)
        .join(Girl, Girl.id == latest.girl_id)
        .order_by(latest.created_at.desc(), latest.id.desc())
        .limit(ENROLLMENTS_PAGE_SIZE)
        .offset((page - 1) * ENROLLMENTS_PAGE_SIZE)
    )
    rows = (await session.execute(statement)).tuples().all()

    return rows, total or 0


# ---------------------------------------------------------------------------
# Card da busca na tela Ingressantes (C8, #317)
# ---------------------------------------------------------------------------

# As fontes que a busca lê (RN-25). "IFAL" entra aqui quando a #274 existir.
SEARCH_SOURCES = ["UFAL"]


async def get_list_search(session: AsyncSession) -> ListSearchOut:
    """As fontes, a data da última busca e a da próxima (RF-F5.23, D-72).

    A última é a da rodada mais recente que terminou bem: uma rodada que parou
    por erro não grava nada (RNF-F31.04). Se a busca foi dividida por curso, é
    a da última parte. A próxima é a última mais o intervalo configurado.
    """
    last = await session.scalar(select(func.max(ListSearchRun.created_at)))
    next_on = None
    if last is not None:
        last_day = last.astimezone(LOCAL_TIMEZONE).date()
        next_on = add_months(last_day, settings.list_search_every_months)

    return ListSearchOut(
        sources=SEARCH_SOURCES, last_search_at=last, next_search_on=next_on
    )


# ---------------------------------------------------------------------------
# Resumo do topo da tela Ingressantes (C8, #316)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SummaryRow:
    """Uma ingressante da lista, só com o que o resumo usa."""

    girl_id: int
    girl_name: str
    level: CourseLevel
    course: str
    institution: str | None
    origin: AdmissionOrigin
    official_list_id: int | None


def _level_summary(rows: Iterable[SummaryRow], level: CourseLevel) -> LevelSummaryOut:
    of_level = [row for row in rows if row.level == level]
    # Cada instituição uma vez, em ordem alfabética, sem as vazias.
    institutions = {(row.institution or "").strip() for row in of_level} - {""}

    return LevelSummaryOut(
        count=len(of_level), institutions=sorted(institutions, key=str.casefold)
    )


def build_summary(
    rows: Sequence[SummaryRow],
    girls_with_account: int,
    last_search_at: datetime | None,
    found_by_last_search: set[tuple[int, int]],
) -> EnrollmentSummaryOut:
    """Monta o resumo a partir das linhas da lista (RF-F5.21, RF-F5.22).

    `rows` são as mesmas meninas da lista "Quem ingressou", das mais recentes
    para as mais antigas. `girls_with_account` são as que foram a ações do grupo
    e criaram conta. `found_by_last_search` são pares (menina, chamada) de
    indícios da última busca que a menina confirmou.
    """
    total = len(rows)
    # Arredonda para o inteiro mais próximo: 5 de 18 é 27,8 e mostra 28%.
    percent = 0
    if girls_with_account:
        percent = (total * 100 + girls_with_account // 2) // girls_with_account

    # Só as que a busca achou: quem declarou o curso sozinha nunca aparece aqui.
    recent = [
        RecentGirlOut(
            first_name=row.girl_name.split()[0] if row.girl_name.strip() else "",
            course=row.course,
            institution=(row.institution or "").strip() or None,
        )
        for row in rows
        if row.origin == AdmissionOrigin.OFFICIAL_LIST
        and row.official_list_id is not None
        and (row.girl_id, row.official_list_id) in found_by_last_search
    ]

    return EnrollmentSummaryOut(
        total=total,
        percent=percent,
        graduacao=_level_summary(rows, CourseLevel.GRADUACAO),
        tecnico=_level_summary(rows, CourseLevel.TECNICO),
        recent=(
            RecentFoundOut(searched_at=last_search_at, girls=recent)
            if recent and last_search_at is not None
            else None
        ),
    )


async def get_enrollment_summary(
    session: AsyncSession, group_id: int
) -> EnrollmentSummaryOut:
    """O resumo do grupo, com as mesmas meninas da lista "Quem ingressou"."""
    latest = latest_enrollments(group_id)
    statement = (
        select(
            latest.girl_id,
            Girl.name,
            latest.level,
            latest.course,
            latest.institution,
            latest.origin,
            latest.official_list_id,
        )
        .join(Girl, Girl.id == latest.girl_id)
        .order_by(latest.created_at.desc(), latest.id.desc())
    )
    rows = [
        SummaryRow(*row) for row in (await session.execute(statement)).tuples().all()
    ]

    girls_with_account = await session.scalar(
        select(func.count()).select_from(girls_of_group(group_id).subquery())
    )
    last_search_at = await session.scalar(select(func.max(ListSearchRun.created_at)))

    # Os indícios criados pela última rodada têm o mesmo created_at dela: os dois
    # são gravados na mesma transação (search.py), e now() do Postgres é o
    # início dela. Só os que a menina confirmou ("Sou eu") contam.
    found: set[tuple[int, int]] = set()
    if last_search_at is not None:
        confirmed = await session.execute(
            select(ListMatch.girl_id, ListMatch.official_list_id).where(
                ListMatch.created_at == last_search_at,
                ListMatch.answered_at.is_not(None),
            )
        )
        found = {(girl_id, list_id) for girl_id, list_id in confirmed.tuples().all()}

    return build_summary(rows, girls_with_account or 0, last_search_at, found)


# ---------------------------------------------------------------------------
# Meninas com indício sem resposta na tela Ingressantes (C8, #318)
# ---------------------------------------------------------------------------


async def list_waiting_girls(
    session: AsyncSession,
    group_id: int,
    page: int,
    entered_total: int,
    entered_shown: int,
    now: datetime | None = None,
) -> tuple[Sequence[tuple[int, str]], int]:
    """As meninas do grupo com indício sem resposta que cabem na página, e o total.

    Elas vêm depois de todas as que ingressaram (RF-F5.24, D-76), então a lista
    é as que ingressaram seguida das que aguardam, cortada em páginas de 15.
    `entered_total` é quantas ingressaram ao todo e `entered_shown` quantas já
    ocupam esta página. Uma linha por menina, mesmo com mais de um indício, da
    que espera há mais tempo para a mais nova; o id desempata.

    Lê só quem tem um indício aberto, sem resposta e dentro do prazo: quando ela
    responde, ou o indício é apagado (RF-F31.06), a linha some. Nunca lê curso,
    instituição nem chamada do indício (RN-21, RNF-F31.02), e nada vai a logs.
    """
    if now is None:
        now = datetime.now(UTC)

    # Quem já tem ingresso está na lista "Quem ingressou": a linha de quem
    # aguarda é só para a menina sem ingresso (RF-F5.24). Mesma noção da lista
    # (qualquer ingresso dela), lendo só o id para não tocar em curso nem
    # instituição.
    waiting = (
        select(ListMatch.girl_id, func.min(ListMatch.created_at).label("waiting_since"))
        .where(
            ListMatch.girl_id.in_(girls_of_group(group_id)),
            ListMatch.girl_id.not_in(select(Enrollment.girl_id)),
            _is_open(now),
        )
        .group_by(ListMatch.girl_id)
        .subquery()
    )
    total = await session.scalar(select(func.count()).select_from(waiting)) or 0

    room = ENROLLMENTS_PAGE_SIZE - entered_shown
    offset = max(0, (page - 1) * ENROLLMENTS_PAGE_SIZE - entered_total)
    if room <= 0 or offset >= total:
        return [], total

    statement = (
        select(Girl.id, Girl.name)
        .join(waiting, waiting.c.girl_id == Girl.id)
        .order_by(waiting.c.waiting_since, Girl.id)
        .limit(room)
        .offset(offset)
    )
    rows = (await session.execute(statement)).tuples().all()

    return rows, total
