"""Reopening the registrations of an action (C2, #237, RF-F1.13, RN-16, RN-37).

Same approach as test_fechar.py: the real services against Postgres.
"""

from datetime import date, timedelta

from httpx2 import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action
from app.users.models import User
from tests.inscricoes.dados import EVENT_DAY, Api, make_group
from tests.inscricoes.test_fechar import girl_with_choice, in_suggestions, open_action

BEFORE = EVENT_DAY - timedelta(days=8)


async def reopen(
    api: Api, coordinator: User, action: Action, today: date = BEFORE
) -> Response:
    return await api(coordinator, today).post(
        f"/api/actions/{action.id}/registrations/reopen"
    )


async def closed_action(banco: AsyncSession) -> tuple[User, Action]:
    _, coordinator, action = await open_action(banco)
    action.registrations_open = False
    await banco.flush()
    return coordinator, action


async def test_reopening_brings_the_action_back_to_the_suggestions(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action = await closed_action(banco)
    girl = await girl_with_choice(banco, action, None)
    assert not await in_suggestions(banco, action, girl)

    response = await reopen(api, coordinator, action)
    body = response.json()

    assert response.status_code == 200
    assert body["registrations_open"] is True
    assert body["registrations_closed_by_coordinator"] is False
    assert body["can_reopen"] is False
    assert await in_suggestions(banco, action, girl)


async def test_reopening_keeps_the_status_and_the_girls(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action = await closed_action(banco)
    before = (await api(coordinator, BEFORE).get(f"/api/actions/{action.id}")).json()

    after = (await reopen(api, coordinator, action)).json()

    assert before["status"] == after["status"] == "awaiting_event"
    assert before["registered_count"] == after["registered_count"] == 3


async def test_reopening_an_open_action_is_not_an_error(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await open_action(banco)

    response = await reopen(api, coordinator, action)

    assert response.status_code == 200
    assert response.json()["registrations_open"] is True


async def test_the_day_before_the_event_still_reopens(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action = await closed_action(banco)

    response = await reopen(api, coordinator, action, EVENT_DAY - timedelta(days=1))

    assert response.status_code == 200
    assert response.json()["registrations_open"] is True


async def test_the_day_of_the_event_refuses_and_the_action_stays_closed(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action = await closed_action(banco)

    response = await reopen(api, coordinator, action, EVENT_DAY)

    assert response.status_code == 409
    assert response.json() == {"error": "event_day_reached"}
    await banco.refresh(action)
    assert action.registrations_open is False


async def test_the_day_after_the_event_refuses_too(
    banco: AsyncSession, api: Api
) -> None:
    coordinator, action = await closed_action(banco)

    response = await reopen(api, coordinator, action, EVENT_DAY + timedelta(days=1))

    assert response.status_code == 409
    assert response.json() == {"error": "event_day_reached"}


async def test_action_of_another_group_is_404_and_stays_closed(
    banco: AsyncSession, api: Api
) -> None:
    _, action = await closed_action(banco)
    _, other_coordinator = await make_group(banco)

    response = await reopen(api, other_coordinator, action)

    assert response.status_code == 404
    await banco.refresh(action)
    assert action.registrations_open is False
