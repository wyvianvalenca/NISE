from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.admissions.models import (
    Approval,
    CourseLevel,
    DismissedMatch,
    Enrollment,
    ListMatch,
    OfficialList,
)

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
