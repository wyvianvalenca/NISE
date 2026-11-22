"""Add a girl who signed up, by hand (C2, #235)."""

import logging
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.girls.models import Girl
from app.modules.groups.models import Group
from app.users.models import User
from tests.inscricoes.dados import (
    EVENT_DAY,
    Api,
    make_action,
    make_girl,
    make_group,
    register,
)

BEFORE = date(2026, 10, 16)


async def count(session: AsyncSession, model: type) -> int:
    return await session.scalar(select(func.count()).select_from(model)) or 0


async def setup(banco: AsyncSession) -> tuple[Group, User, Action]:
    group, coordinator = await make_group(banco)
    return group, coordinator, await make_action(banco, group)


def url(action: Action) -> str:
    return f"/api/actions/{action.id}/registrations"


# ---- POST ----


async def test_new_girl_is_added_with_a_record(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator, BEFORE).post(
        url(action),
        json={
            "name": " Júlia Pereira ",
            "email": "Julia.P@Exemplo.com",
            "whatsapp": "(82) 99999-0000",
            "study_stage": "fundamental",
            "school_year": "8º",
        },
    )
    body = response.json()

    assert response.status_code == 201
    assert body["already_registered"] is False
    assert body["record_existed"] is False
    assert body["registration"]["name"] == "Júlia Pereira"
    assert body["registration"]["email"] == "julia.p@exemplo.com"
    assert body["registration"]["whatsapp"] == "(82) 99999-0000"
    assert body["registration"]["study_stage"] == "fundamental"
    assert body["registration"]["school_year"] == "8º"
    assert await count(banco, Participation) == 1
    listed = (await api(coordinator, BEFORE).get(url(action))).json()
    assert listed["total"] == 1


async def test_girl_with_a_record_is_linked_not_copied(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    girl = await make_girl(banco, "Nome Antigo")

    response = await api(coordinator, BEFORE).post(
        url(action), json={"name": "Nome Novo", "email": girl.email}
    )
    body = response.json()

    assert response.status_code == 201
    assert body["record_existed"] is True
    assert body["already_registered"] is False
    assert body["registration"]["name"] == "Nome Novo"
    assert await count(banco, Girl) == 1
    await banco.refresh(girl)
    assert girl.name == "Nome Antigo"


async def test_same_girl_twice_changes_nothing(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)
    client = api(coordinator, BEFORE)
    first = await client.post(
        url(action), json={"name": "Ana", "email": "ana@exemplo.com", "whatsapp": "1"}
    )

    second = await client.post(
        url(action), json={"name": "Outro Nome", "email": "ANA@exemplo.com"}
    )

    assert second.status_code == 201
    assert second.json()["already_registered"] is True
    assert second.json()["registration"] == first.json()["registration"]
    assert await count(banco, Participation) == 1
    assert await count(banco, Girl) == 1


async def test_missing_name_is_refused_and_nothing_is_saved(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    client = api(coordinator, BEFORE)

    for name in ("", "   "):
        response = await client.post(
            url(action), json={"name": name, "email": "ana@exemplo.com"}
        )
        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"][-1] == "name"

    assert await count(banco, Girl) == 0
    assert await count(banco, Participation) == 0


@pytest.mark.parametrize("email", ["", "   ", "ana", "ana@", "ana@exemplo"])
async def test_missing_or_invalid_email_is_refused(
    banco: AsyncSession, api: Api, email: str
) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator, BEFORE).post(
        url(action), json={"name": "Ana", "email": email}
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == "email"
    assert await count(banco, Girl) == 0
    assert await count(banco, Participation) == 0


async def test_too_long_fields_are_refused(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator, BEFORE).post(
        url(action),
        json={"name": "Ana", "email": "ana@exemplo.com", "whatsapp": "9" * 41},
    )

    assert response.status_code == 422
    assert await count(banco, Participation) == 0


async def test_blank_optional_fields_become_null(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator, BEFORE).post(
        url(action),
        json={
            "name": "Ana",
            "email": "ana@exemplo.com",
            "whatsapp": "  ",
            "study_stage": None,
            "school_year": "",
        },
    )
    registration = response.json()["registration"]

    assert response.status_code == 201
    assert registration["whatsapp"] is None
    assert registration["study_stage"] is None
    assert registration["school_year"] is None


async def test_school_year_infers_the_stage(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)

    response = await api(coordinator, BEFORE).post(
        url(action),
        json={"name": "Ana", "email": "ana@exemplo.com", "school_year": "8º ano"},
    )

    assert response.json()["registration"]["study_stage"] == "fundamental"


async def test_closed_registrations_still_accept_a_girl(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator = await make_group(banco)
    action = await make_action(banco, group, registrations_open=False)

    response = await api(coordinator, BEFORE).post(
        url(action), json={"name": "Ana", "email": "ana@exemplo.com"}
    )
    after_the_day = await api(coordinator, EVENT_DAY).post(
        url(action), json={"name": "Bia", "email": "bia@exemplo.com"}
    )

    assert response.status_code == 201
    assert after_the_day.status_code == 201
    assert await count(banco, Participation) == 2


async def test_action_of_another_group_is_404_and_nothing_is_saved(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, _ = await setup(banco)
    other_group, _ = await make_group(banco)
    other_action = await make_action(banco, other_group)

    response = await api(coordinator, BEFORE).post(
        url(other_action), json={"name": "Ana", "email": "ana@exemplo.com"}
    )

    assert response.status_code == 404
    assert await count(banco, Girl) == 0
    assert await count(banco, Participation) == 0


async def test_adding_never_creates_an_account(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)
    users = await count(banco, User)

    await api(coordinator, BEFORE).post(
        url(action), json={"name": "Ana", "email": "ana@exemplo.com"}
    )

    assert await count(banco, User) == users
    girl = await banco.scalar(select(Girl).where(Girl.email == "ana@exemplo.com"))
    assert girl is not None
    assert girl.user_id is None


async def test_nothing_about_the_girl_is_logged(
    banco: AsyncSession, api: Api, caplog: pytest.LogCaptureFixture
) -> None:
    _, coordinator, action = await setup(banco)

    with caplog.at_level(logging.DEBUG):
        await api(coordinator, BEFORE).post(
            url(action),
            json={"name": "Zuleica Sigilosa", "email": "sigilo@exemplo.com"},
        )
        await api(coordinator, BEFORE).post(
            url(action), json={"name": "", "email": "sigilo@exemplo.com"}
        )

    assert "Zuleica" not in caplog.text
    assert "sigilo@exemplo.com" not in caplog.text


# ---- GET email-check ----


def check(action: Action, email: str) -> tuple[str, dict[str, str]]:
    return f"{url(action)}/email-check", {"email": email}


async def test_check_girl_of_the_group_lists_the_other_actions(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator, action = await setup(banco)
    girl = await make_girl(banco)
    old = await make_action(banco, group, date(2026, 9, 26), name="Arduino na escola")
    await register(banco, old, girl)
    await register(banco, action, girl)  # this action is never listed

    path, params = check(action, girl.email.upper())
    response = await api(coordinator, BEFORE).get(path, params=params)

    assert response.status_code == 200
    assert response.json() == {
        "exists": True,
        "group_actions": [{"name": "Arduino na escola", "starts_on": "2026-09-26"}],
    }


async def test_check_girl_of_another_group_exists_with_no_actions(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, action = await setup(banco)
    other_group, _ = await make_group(banco)
    girl = await make_girl(banco)
    await register(banco, await make_action(banco, other_group, name="Segredo"), girl)

    path, params = check(action, girl.email)
    response = await api(coordinator, BEFORE).get(path, params=params)

    assert response.json() == {"exists": True, "group_actions": []}
    assert "Segredo" not in response.text


async def test_check_girl_of_both_lists_only_the_own_group_newest_first_max_three(
    banco: AsyncSession, api: Api
) -> None:
    group, coordinator, action = await setup(banco)
    other_group, _ = await make_group(banco)
    girl = await make_girl(banco)
    await register(banco, await make_action(banco, other_group, name="Segredo"), girl)
    for month in (3, 5, 4, 6):
        past = await make_action(
            banco, group, date(2026, month, 10), name=f"Mês {month}"
        )
        await register(banco, past, girl)

    path, params = check(action, girl.email)
    response = await api(coordinator, BEFORE).get(path, params=params)

    names = [item["name"] for item in response.json()["group_actions"]]
    assert names == ["Mês 6", "Mês 5", "Mês 4"]
    assert "Segredo" not in response.text


async def test_check_unknown_email(banco: AsyncSession, api: Api) -> None:
    _, coordinator, action = await setup(banco)

    path, params = check(action, "ninguem@exemplo.com")
    response = await api(coordinator, BEFORE).get(path, params=params)

    assert response.json() == {"exists": False, "group_actions": []}


async def test_check_action_of_another_group_is_404(
    banco: AsyncSession, api: Api
) -> None:
    _, coordinator, _ = await setup(banco)
    other_group, _ = await make_group(banco)
    other_action = await make_action(banco, other_group)

    path, params = check(other_action, "ana@exemplo.com")
    response = await api(coordinator, BEFORE).get(path, params=params)

    assert response.status_code == 404
