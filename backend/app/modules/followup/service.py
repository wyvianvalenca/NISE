import enum
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.followup.models import FollowupActivity, FollowupAnswer, FollowupHelp
from app.modules.followup.schemas import CurrentFollowupOut, FollowupIn
from app.modules.followup.utils import OpenRound, open_round
from app.modules.girls.models import Girl
from app.modules.girls.utils import today_in_maceio
from app.users.models import User


class FollowupResult(enum.Enum):
    SAVED = "saved"
    # Não há rodada aberta hoje, ou a rodada enviada já fechou.
    NO_OPEN_ROUND = "no_open_round"
    ALREADY_ANSWERED = "already_answered"


async def _open_round_for(
    session: AsyncSession, user_id: int, now: datetime | None
) -> tuple[int, str, OpenRound] | None:
    """A menina da sessão, o nome dela e a rodada aberta hoje, ou None.

    As rodadas contam da criação da conta (User.created_at, RN-02), não do
    registro da menina: quem foi importada de uma lista tem o registro antes
    da conta.
    """
    row = (
        await session.execute(
            select(Girl.id, User.name, User.created_at)
            .join(User, User.id == Girl.user_id)
            .where(Girl.user_id == user_id)
        )
    ).first()

    if row is None:
        return None

    girl_id, name, account_created_at = row
    current = open_round(
        today_in_maceio(account_created_at), today=today_in_maceio(now)
    )

    if current is None:
        return None

    return girl_id, name, current


async def _already_answered(
    session: AsyncSession, girl_id: int, current: OpenRound
) -> bool:
    answer_id = await session.scalar(
        select(FollowupAnswer.id).where(
            FollowupAnswer.girl_id == girl_id,
            FollowupAnswer.round == current.round,
        )
    )
    return answer_id is not None


async def get_current_followup(
    session: AsyncSession, user_id: int, now: datetime | None = None
) -> CurrentFollowupOut | None:
    """A rodada aberta hoje para a menina da sessão, ou None (#293)."""
    found = await _open_round_for(session, user_id, now)

    if found is None:
        return None

    girl_id, name, current = found

    return CurrentFollowupOut(
        round=current.round,
        last_day=current.last_day,
        first_name=name.split()[0] if name.strip() else "",
        answered=await _already_answered(session, girl_id, current),
    )


async def record_followup(
    session: AsyncSession,
    user_id: int,
    data: FollowupIn,
    now: datetime | None = None,
) -> FollowupResult:
    """Grava as respostas da menina da sessão à rodada aberta (RF-F4.07).

    Só a rodada aberta hoje aceita resposta, e só uma vez.
    """
    found = await _open_round_for(session, user_id, now)

    if found is None:
        return FollowupResult.NO_OPEN_ROUND

    girl_id, _, current = found

    if data.round is not current.round:
        return FollowupResult.NO_OPEN_ROUND

    if await _already_answered(session, girl_id, current):
        return FollowupResult.ALREADY_ANSWERED

    session.add(
        FollowupAnswer(
            girl_id=girl_id,
            round=current.round,
            computing_view=data.computing_view,
            future_self=data.future_self,
            # Comentário vazio é o mesmo que nenhum.
            comment=data.comment or None,
            activities=[FollowupActivity(activity=a) for a in data.activities],
            helps=[FollowupHelp(help=h) for h in data.helps],
        )
    )

    try:
        await session.commit()
    except IntegrityError:
        # Dois envios ao mesmo tempo: o outro já gravou as respostas.
        await session.rollback()
        return FollowupResult.ALREADY_ANSWERED

    return FollowupResult.SAVED
