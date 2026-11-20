"""Two requests at the same time on the same action (C3, #135).

Each request has its own connection and really commits, as in production.
Names and e-mails are fictional.
"""

import asyncio

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.actions.models import Participation
from app.modules.girls.models import Girl
from tests.presenca.conftest import client_for
from tests.presenca.dados import make_action, make_group


async def test_dois_toques_no_adicionar_criam_uma_menina_so(
    banco_concorrente: async_sessionmaker[AsyncSession],
) -> None:
    async with banco_concorrente() as session:
        group, coordinator = await make_group(session)
        action = await make_action(session, group)
    body = {"name": "Menina", "email": "corrida@exemplo.com"}

    async with client_for(coordinator) as first, client_for(coordinator) as second:
        responses = await asyncio.gather(
            *(
                client.post(f"/api/actions/{action.id}/attendance/girls", json=body)
                for client in (first, second, first, second)
            )
        )

    assert [response.status_code for response in responses] == [200] * 4
    assert sum(not r.json()["already_registered"] for r in responses) == 1
    async with banco_concorrente() as session:
        girls = await session.scalar(
            select(func.count()).select_from(Girl).where(Girl.email == body["email"])
        )
        registrations = await session.scalar(
            select(func.count())
            .select_from(Participation)
            .where(Participation.action_id == action.id)
        )
    assert girls == 1
    assert registrations == 1
