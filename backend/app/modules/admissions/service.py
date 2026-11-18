from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.admissions.exceptions import MatchForbiddenError
from app.modules.admissions.models import (
    Approval,
    CourseLevel,
    DismissedMatch,
    Enrollment,
    ListMatch,
    OfficialList,
)
from app.modules.admissions.permissions import coordinates_a_group_of_girl
from app.users.models import Role, User

# Sem resposta nesse prazo, o indício é apagado (RF-F31.06).
MATCH_DAYS = 30


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
    chamada nunca gera o indício de novo (RF-F31.06). Não faz commit; quem
    chama grava a rodada inteira de uma vez.
    """
    if now is None:
        now = datetime.now(UTC)

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
    """Diz só se existe um indício sem resposta, sem nenhum detalhe dele."""
    if now is None:
        now = datetime.now(UTC)

    statement = select(exists().where(ListMatch.girl_id == girl_id, _is_open(now)))

    return bool(await session.scalar(statement))


async def match_flag_for_coordinator(
    session: AsyncSession, user: User, girl_id: int, now: datetime | None = None
) -> bool:
    """O fato que a C5 (#137) mostra como "Possível aprovação" (RF-F5.10).

    Só a coordenadora de um grupo da menina recebe a resposta, e ela é só um
    sim ou não. Qualquer outra conta, inclusive a curadoria, leva
    MatchForbiddenError (RNF-F31.02, RNF-G.03).
    """
    if user.role != Role.COORDINATOR:
        raise MatchForbiddenError

    if not await coordinates_a_group_of_girl(session, user.id, girl_id):
        raise MatchForbiddenError

    return await girl_has_open_match(session, girl_id, now)


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

    statement = select(ListMatch).where(
        ListMatch.answered_at.is_(None), ListMatch.expires_at <= now
    )
    expired = (await session.scalars(statement)).all()

    for match in expired:
        await dismiss_match(session, match)

    await session.commit()

    return len(expired)
