from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agenda.schemas import UpcomingItemOut
from app.modules.dates.service import list_important_dates
from app.modules.followup.models import FollowupRound
from app.modules.followup.utils import round_window
from app.modules.girls.utils import today_in_maceio
from app.users.models import User


async def list_upcoming(
    session: AsyncSession, user_id: int, today: date
) -> list[UpcomingItemOut]:
    """As datas importantes de hoje em diante e as rodadas que ainda vão abrir.

    Data antes de hoje não aparece. A rodada aberta hoje também não: ela está
    em "Pra responder" (RF-F4.06). As rodadas contam da criação da conta
    (RN-02), como em followup.service.
    """
    account_created_at = await session.scalar(
        select(User.created_at).where(User.id == user_id)
    )
    account_day = today_in_maceio(account_created_at)

    items = [
        UpcomingItemOut(
            kind="date",
            on=found.on,
            title=found.title,
            details=found.details,
            round=None,
        )
        for found in await list_important_dates(session, today)
    ]

    for followup_round in FollowupRound:
        opens_on = round_window(account_day, followup_round).opens_on
        if opens_on > today:
            items.append(
                UpcomingItemOut(
                    kind="followup",
                    on=opens_on,
                    title=None,
                    details=None,
                    round=followup_round,
                )
            )

    # sorted é estável: no mesmo dia, a data da equipe vem antes do questionário.
    return sorted(items, key=lambda item: item.on)
