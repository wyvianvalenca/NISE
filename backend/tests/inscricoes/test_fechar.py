"""Closing the registrations of an action (C2, #236, RF-F1.10, RN-36, RN-37).

The effect on the girls is checked with the real services against Postgres:
the catalog behind Descobrir, the "Ver depois" and the filé.
"""

from datetime import date, timedelta

from httpx2 import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, ActionVisibility
from app.modules.catalog.models import ItemOrigin
from app.modules.catalog.service import load_catalog, suggestible_audience
from app.modules.catalog.utils import item_id
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girl_file.service import load_file, load_later
from app.modules.girls.models import Girl
from app.modules.groups.models import Group
from app.modules.registrations.service import RegistrationData, register_girl
from app.users.models import User
from tests.inscricoes.dados import (
    EVENT_DAY,
    Api,
    make_action,
    make_girl,
    make_group,
    register,
)

BEFORE = EVENT_DAY - timedelta(days=8)


async def open_action(banco: AsyncSession) -> tuple[Group, User, Action]:
    """A public action of the group, open to sign-ups and with girls in it."""
    group, coordinator = await make_group(banco)
    action = await make_action(
        banco,
        group,
        visibility=ActionVisibility.OPEN,
        registration_url="https://forms.exemplo.com/inscricao",
    )
    for number in range(3):
        await register(banco, action, await make_girl(banco, f"Menina {number}"))
    return group, coordinator, action


async def girl_with_choice(
    banco: AsyncSession, action: Action, status: FileStatus | None
) -> Girl:
    """A girl with an account who made `status` her choice on the action."""
    girl = await make_girl(banco, with_account=True)
    if status is not None:
        banco.add(FileEntry(girl_id=girl.id, action_id=action.id, status=status))
        await banco.flush()
    return girl


async def in_suggestions(banco: AsyncSession, action: Action, girl: Girl) -> bool:
    """Descobrir and the suggestions read the catalog; "+ Quero fazer" checks it."""
    catalog = await load_catalog(banco, girl.city_ibge_code, BEFORE)
    listed = item_id(ItemOrigin.GROUP_ACTION, action.id) in [i.id for i in catalog]
    allowed = (
        await suggestible_audience(
            banco, ItemOrigin.GROUP_ACTION, action.id, girl.city_ibge_code, BEFORE
        )
        is not None
    )
    assert listed == allowed
    return listed


async def in_later(banco: AsyncSession, action: Action, girl: Girl) -> bool:
    assert girl.user_id is not None
    later = await load_later(banco, girl.user_id, BEFORE)
    assert later is not None
    return item_id(ItemOrigin.GROUP_ACTION, action.id) in [i.id for i in later.items]


async def in_file(banco: AsyncSession, action: Action, girl: Girl) -> bool:
    assert girl.user_id is not None
    file = await load_file(banco, girl.user_id)
    assert file is not None
    mine = item_id(ItemOrigin.GROUP_ACTION, action.id)
    return mine in [i.id for i in file.next.items + file.in_progress.items]


async def close(
    api: Api, coordinator: User, action: Action, today: date = BEFORE
) -> Response:
    return await api(coordinator, today).post(
        f"/api/actions/{action.id}/registrations/close"
    )


async def test_closing_an_action_with_girls_closes_it_and_keeps_the_count(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await open_action(banco)

    response = await close(api, coordinator, action)
    body = response.json()

    assert response.status_code == 200
    assert body["registrations_open"] is False
    assert body["registrations_closed_by_coordinator"] is True
    assert body["can_reopen"] is True
    assert body["registered_count"] == 3
    await banco.refresh(action)
    assert action.registrations_open is False


async def test_closing_keeps_the_status(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await open_action(banco)
    before = (await api(coordinator, BEFORE).get(f"/api/actions/{action.id}")).json()

    after = (await close(api, coordinator, action)).json()

    assert before["status"] == "awaiting_event"
    assert after["status"] == "awaiting_event"


async def test_closing_twice_is_not_an_error(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await open_action(banco)

    first = await close(api, coordinator, action)
    second = await close(api, coordinator, action)

    assert first.status_code == second.status_code == 200
    assert second.json() == first.json()


async def test_closed_action_leaves_the_suggestions_of_a_girl_who_did_not_have_it(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await open_action(banco)
    stranger = await girl_with_choice(banco, action, None)
    assert await in_suggestions(banco, action, stranger)

    await close(api, coordinator, action)

    assert not await in_suggestions(banco, action, stranger)


async def test_closed_action_leaves_ver_depois_but_the_choice_is_kept(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await open_action(banco)
    girl = await girl_with_choice(banco, action, FileStatus.LATER)
    assert await in_later(banco, action, girl)

    await close(api, coordinator, action)

    assert not await in_later(banco, action, girl)
    kept = await banco.get(FileEntry, (await _entry_id(banco, girl, action)))
    assert kept is not None and kept.status is FileStatus.LATER


async def _entry_id(banco: AsyncSession, girl: Girl, action: Action) -> int:
    entry_id = await banco.scalar(
        select(FileEntry.id).where(
            FileEntry.girl_id == girl.id, FileEntry.action_id == action.id
        )
    )
    assert entry_id is not None
    return entry_id


async def test_closed_action_stays_in_the_file_of_who_wanted_to_do_it(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await open_action(banco)
    girl = await girl_with_choice(banco, action, FileStatus.NEXT)

    await close(api, coordinator, action)

    assert await in_file(banco, action, girl)


async def test_closed_action_stays_in_the_file_of_a_registered_girl(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await open_action(banco)
    girl = await girl_with_choice(banco, action, FileStatus.SIGNED_UP)
    await register(banco, action, girl)

    await close(api, coordinator, action)

    assert await in_file(banco, action, girl)
    file = await load_file(banco, girl.user_id or 0)
    assert file is not None
    assert [i.signed_up for i in file.next.items] == [True]


async def test_a_girl_can_be_added_after_closing(banco: AsyncSession, api: Api) -> None:
    group, coordinator, action = await open_action(banco)
    await close(api, coordinator, action)

    result = await register_girl(
        banco,
        action,
        [group.id],
        RegistrationData(name="Menina Nova", email="nova@exemplo.com"),
    )

    assert result.already_registered is False
    page = (await api(coordinator, BEFORE).get(f"/api/actions/{action.id}")).json()
    assert page["registered_count"] == 4
    assert page["registrations_open"] is False


async def test_action_of_another_group_is_404_and_stays_open(
    banco: AsyncSession, api: Api
) -> None:
    _, _, action = await open_action(banco)
    _, other_coordinator = await make_group(banco)

    response = await close(api, other_coordinator, action)

    assert response.status_code == 404
    await banco.refresh(action)
    assert action.registrations_open is True


async def test_closing_needs_a_signed_in_coordinator(
    banco: AsyncSession, api: Api
) -> None:
    _, _, action = await open_action(banco)

    response = await api(None, BEFORE).post(
        f"/api/actions/{action.id}/registrations/close"
    )

    assert response.status_code in (401, 403)


# ---- RF-F1.16: on the day of the event they count as closed (Should) ----


async def test_registrations_count_as_closed_from_the_event_day(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await open_action(banco)
    days = {
        "day before": EVENT_DAY - timedelta(days=1),
        "the day": EVENT_DAY,
        "day after": EVENT_DAY + timedelta(days=1),
    }

    opened = {}
    for name, day in days.items():
        body = (await api(coordinator, day).get(f"/api/actions/{action.id}")).json()
        opened[name] = body["registrations_open"]

    assert opened == {"day before": True, "the day": False, "day after": False}
    # Nobody closed it: the stored flag is untouched, the date does the work.
    await banco.refresh(action)
    assert action.registrations_open is True
