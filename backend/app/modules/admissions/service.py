from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, Select, exists, func, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

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
    OfficialList,
)
from app.modules.admissions.schemas import MatchAnswerIn, MatchResult
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
    latest = aliased(
        Enrollment,
        select(Enrollment)
        .where(Enrollment.girl_id.in_(girls_of_group(group_id)))
        .ext(distinct_on(Enrollment.girl_id))
        .order_by(
            Enrollment.girl_id, Enrollment.created_at.desc(), Enrollment.id.desc()
        )
        .subquery(),
    )

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
