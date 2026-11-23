"""Two requests at the same time on the same action (C3, #135).

Each request has its own connection and really commits, as in production.
Names and e-mails are fictional.
"""

import asyncio

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.actions.models import Participation
from app.modules.attendance.models import AttendanceEmail
from app.modules.girls.models import Girl
from tests.presenca.conftest import client_for
from tests.presenca.dados import (
    CorreioFalso,
    make_action,
    make_girl,
    make_group,
    register,
)


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


async def test_dois_concluir_ao_mesmo_tempo_enviam_uma_vez_so(
    banco_concorrente: async_sessionmaker[AsyncSession], correio: CorreioFalso
) -> None:
    async with banco_concorrente() as session:
        group, coordinator = await make_group(session)
        action = await make_action(session, group)
        girls = [await make_girl(session) for _ in range(3)]
        registrations = [await register(session, action, girl) for girl in girls]
    body = {"present_ids": [registrations[0].id]}

    async with client_for(coordinator) as first, client_for(coordinator) as second:
        responses = await asyncio.gather(
            *(
                client.post(f"/api/actions/{action.id}/attendance/conclude", json=body)
                for client in (first, second, first, second)
            )
        )

    assert [response.status_code for response in responses] == [200] * 4
    # 3 invites (nobody has an account) and 1 evaluation, once each.
    assert len(correio.sent) == 4
    async with banco_concorrente() as session:
        queued = await session.scalar(
            select(func.count())
            .select_from(AttendanceEmail)
            .where(AttendanceEmail.action_id == action.id)
        )
    assert queued == 4
