"""The action page and the list of its registered girls (C2, #233)."""

from datetime import date, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, ActionFormat, Participation
from app.modules.girls.models import StudyStage
from app.modules.groups.models import Group
from app.users.models import Role, User
from tests.inscricoes.dados import (
    EVENT_DAY,
    Api,
    at,
    make_action,
    make_girl,
    make_group,
    make_user,
    register,
)

BEFORE = EVENT_DAY - timedelta(days=8)


async def girls_in(banco: AsyncSession, action: Action, count: int) -> None:
    for number in range(count):
        girl = await make_girl(banco, f"Menina Número {number:02d}")
        await register(banco, action, girl)


async def setup(banco: AsyncSession) -> tuple[Group, User, Action]:
    group, coordinator = await make_group(banco)
    return group, coordinator, await make_action(banco, group)


# ---- the action page ----


async def test_action_with_no_girl_awaits_registrations(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator, BEFORE).get(f"/api/actions/{action.id}")
    body = response.json()

    assert response.status_code == 200
    assert body["status"] == "awaiting_registrations"
    assert body["registered_count"] == 0
    assert body["registrations_open"] is True
    assert body["registrations_closed_by_coordinator"] is False
    assert body["can_delete"] is True
    assert body["can_reopen"] is False
    assert body["city_name"] is None
    assert body["today"] == BEFORE.isoformat()


async def test_action_with_girls_awaits_the_event_and_counts_them(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    await girls_in(banco, action, 23)

    body = (await api(coordinator, BEFORE).get(f"/api/actions/{action.id}")).json()

    assert body["status"] == "awaiting_event"
    assert body["registered_count"] == 23


async def test_in_person_action_gives_the_city_name_and_creation_day(
    banco: AsyncSession, api: Api
) -> None:
    from app.modules.cities.models import City

    group, coordinator = await make_group(banco)
    banco.add(City(id=2704302, name="Maceió", state="AL", search_name="maceio, al"))
    await banco.flush()
    action = await make_action(
        banco, group, format=ActionFormat.IN_PERSON, city_ibge_code=2704302
    )

    body = (await api(coordinator, BEFORE).get(f"/api/actions/{action.id}")).json()

    assert body["city_name"] == "Maceió"
    assert body["city_label"] == "Maceió, AL"
    assert date.fromisoformat(body["created_on"])


async def test_closed_by_the_coordinator_is_closed_and_can_reopen(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group, registrations_open=False)

    body = (await api(coordinator, BEFORE).get(f"/api/actions/{action.id}")).json()

    assert body["registrations_open"] is False
    assert body["registrations_closed_by_coordinator"] is True
    assert body["can_reopen"] is True


async def test_registrations_close_by_themselves_on_the_event_day(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)

    body = (await api(coordinator, EVENT_DAY).get(f"/api/actions/{action.id}")).json()

    assert body["registrations_open"] is False
    assert body["registrations_closed_by_coordinator"] is False
    assert body["can_reopen"] is False
    assert body["status"] == "awaiting_attendance"


async def test_concluded_action_cannot_be_deleted(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group, attendance_registered_at=at(EVENT_DAY))

    body = (
        await api(coordinator, EVENT_DAY + timedelta(days=1)).get(
            f"/api/actions/{action.id}"
        )
    ).json()

    assert body["status"] == "concluded"
    assert body["can_delete"] is False


async def test_action_of_another_group_is_404_on_the_page_and_the_list(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, _ = await setup(banco)
    other_group, _ = await make_group(banco)
    other = await make_action(banco, other_group)
    await girls_in(banco, other, 2)
    client = api(coordinator, BEFORE)

    page = await client.get(f"/api/actions/{other.id}")
    girls = await client.get(f"/api/actions/{other.id}/registrations")

    assert page.status_code == 404
    assert girls.status_code == 404
    assert (await client.get("/api/actions/999999")).status_code == 404


async def test_page_and_list_need_a_signed_in_coordinator(
    banco: AsyncSession, api: Api
) -> None:
    _, _, action = await setup(banco)
    girl_user = await make_user(banco, Role.GIRL)

    for path in (
        f"/api/actions/{action.id}",
        f"/api/actions/{action.id}/registrations",
    ):
        assert (await api(None).get(path)).status_code == 401
        assert (await api(girl_user).get(path)).status_code == 403


# ---- the list of girls ----


async def test_empty_list(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)

    body = (
        await api(coordinator, BEFORE).get(f"/api/actions/{action.id}/registrations")
    ).json()

    assert body == {"items": [], "total": 0, "columns": []}


async def test_list_pages_the_23_girls_in_name_order(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    await girls_in(banco, action, 23)
    client = api(coordinator, BEFORE)
    url = f"/api/actions/{action.id}/registrations"

    first = (await client.get(url, params={"limit": 6})).json()
    last = (await client.get(url, params={"offset": 20, "limit": 6})).json()

    assert first["total"] == 23
    assert [i["name"] for i in first["items"]] == [
        f"Menina Número {n:02d}" for n in range(6)
    ]
    assert [i["name"] for i in last["items"]] == [
        f"Menina Número {n:02d}" for n in (20, 21, 22)
    ]
    assert first["items"][0].keys() == {
        "id",
        "name",
        "email",
        "whatsapp",
        "study_stage",
        "school_year",
    }


async def test_search_finds_by_name_and_by_email_ignoring_case(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    ana = await make_girl(banco, "Ana Fictícia")
    bia = await make_girl(banco, "Bia Qualquer")
    await register(banco, action, ana)
    await register(banco, action, bia)
    client = api(coordinator, BEFORE)
    url = f"/api/actions/{action.id}/registrations"

    by_name = (await client.get(url, params={"search": "fICT"})).json()
    by_email = (await client.get(url, params={"search": bia.email.upper()})).json()
    none = (await client.get(url, params={"search": "zzz"})).json()

    assert [i["name"] for i in by_name["items"]] == ["Ana Fictícia"]
    assert by_name["total"] == 1
    assert [i["email"] for i in by_email["items"]] == [bia.email]
    assert none["total"] == 0


async def test_search_treats_percent_and_underscore_as_plain_characters(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    await register(banco, action, await make_girl(banco, "Ana Fictícia"))
    client = api(coordinator, BEFORE)

    body = (
        await client.get(
            f"/api/actions/{action.id}/registrations", params={"search": "%"}
        )
    ).json()

    assert body["total"] == 0


async def test_columns_follow_the_data_of_the_registrations(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    plain = await make_action(banco, group)
    rich = await make_action(banco, group)
    await register(banco, plain, await make_girl(banco, "Sem Extras"))
    girl = await make_girl(banco, "Com Extras")
    banco.add(
        Participation(
            girl_id=girl.id,
            action_id=rich.id,
            whatsapp="82 99999-0000",
            study_stage=StudyStage.MEDIO,
            school_year="2ª série",
        )
    )
    await banco.flush()
    client = api(coordinator, BEFORE)

    without = (await client.get(f"/api/actions/{plain.id}/registrations")).json()
    with_data = (await client.get(f"/api/actions/{rich.id}/registrations")).json()
    searched = (
        await client.get(
            f"/api/actions/{rich.id}/registrations", params={"search": "nada"}
        )
    ).json()

    assert without["columns"] == []
    assert with_data["columns"] == ["whatsapp", "study_stage", "school_year"]
    assert with_data["items"][0]["whatsapp"] == "82 99999-0000"
    assert with_data["items"][0]["study_stage"] == "medio"
    # The columns ignore the search.
    assert searched["items"] == []
    assert searched["columns"] == with_data["columns"]


async def test_list_shows_the_name_of_the_registration_over_the_record(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    girl = await make_girl(banco, "Nome De Outro Grupo")
    banco.add(Participation(girl_id=girl.id, action_id=action.id, name="Nome Daqui"))
    await banco.flush()

    body = (
        await api(coordinator, BEFORE).get(f"/api/actions/{action.id}/registrations")
    ).json()

    assert [i["name"] for i in body["items"]] == ["Nome Daqui"]


@pytest.mark.parametrize("limit", [0, 501])
async def test_limit_outside_1_to_500_is_422(
    banco: AsyncSession, api: Api, limit: int
) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator, BEFORE).get(
        f"/api/actions/{action.id}/registrations", params={"limit": limit}
    )

    assert response.status_code == 422
