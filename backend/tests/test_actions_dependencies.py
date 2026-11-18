"""Group access of the action routes (RN-14, RNF-G.03, #208).

There is no action route yet, so a test-only app uses the shared dependencies,
like test_auth_permissions.py does. The session is fake: what is checked is who
is let in and what the query asks for.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI

from app.auth.utils import create_access_token
from app.modules.actions.dependencies import CoordinatorGroupIdDep, GroupActionDep
from app.users.models import Role, User
from tests.helpers import chamar_rota

app_teste = FastAPI()


@app_teste.get("/group")
async def read_group(group_id: CoordinatorGroupIdDep) -> dict[str, int]:
    return {"group_id": group_id}


@app_teste.get("/actions/{action_id}")
async def read_action(action: GroupActionDep) -> dict[str, int]:
    return {"id": action.id}


def make_user(role: Role) -> User:
    return User(id=1, email="usuaria@exemplo.com", name="Usuaria Ficticia", role=role)


def make_session(
    user: User | None, group_ids: list[int], action: object | None = None
) -> AsyncMock:
    session = AsyncMock()
    session.get.return_value = user
    session.scalars.return_value = MagicMock(all=MagicMock(return_value=group_ids))
    session.scalar.return_value = action
    return session


def token_for(user: User) -> str:
    return create_access_token(user.id)


async def test_coordinator_of_one_group_gets_that_group() -> None:
    user = make_user(Role.COORDINATOR)

    response = await chamar_rota(
        app_teste, "GET", "/group", make_session(user, [5]), token_for(user)
    )

    assert response.status_code == 200
    assert response.json() == {"group_id": 5}


async def test_without_login_the_answer_is_401() -> None:
    session = make_session(None, [])

    response = await chamar_rota(app_teste, "GET", "/group", session)

    assert response.status_code == 401
    session.scalars.assert_not_awaited()


async def test_a_girl_gets_403_and_her_groups_are_not_even_looked_up() -> None:
    user = make_user(Role.GIRL)
    session = make_session(user, [5])

    response = await chamar_rota(app_teste, "GET", "/group", session, token_for(user))

    assert response.status_code == 403
    session.scalars.assert_not_awaited()


async def test_coordinator_without_a_group_gets_403() -> None:
    user = make_user(Role.COORDINATOR)

    response = await chamar_rota(
        app_teste, "GET", "/group", make_session(user, []), token_for(user)
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Sem grupo"


async def test_coordinator_of_two_groups_gets_409_and_no_group_is_picked() -> None:
    user = make_user(Role.COORDINATOR)

    response = await chamar_rota(
        app_teste, "GET", "/group", make_session(user, [5, 6]), token_for(user)
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Coordenadora em mais de um grupo"


async def test_the_action_is_looked_up_filtered_by_the_coordinators_group() -> None:
    user = make_user(Role.COORDINATOR)
    found = MagicMock(id=7)
    session = make_session(user, [5], action=found)

    response = await chamar_rota(
        app_teste, "GET", "/actions/7", session, token_for(user)
    )

    assert response.status_code == 200
    assert response.json() == {"id": 7}
    statement = session.scalar.await_args.args[0]
    assert statement.compile().params == {"id_1": 7, "group_id_1": [5]}


async def test_coordinator_of_two_groups_reaches_an_action_of_either_group() -> None:
    user = make_user(Role.COORDINATOR)
    session = make_session(user, [5, 6], action=MagicMock(id=7))

    response = await chamar_rota(
        app_teste, "GET", "/actions/7", session, token_for(user)
    )

    assert response.status_code == 200
    statement = session.scalar.await_args.args[0]
    assert statement.compile().params == {"id_1": 7, "group_id_1": [5, 6]}


async def test_a_group_sent_in_the_request_is_ignored() -> None:
    user = make_user(Role.COORDINATOR)
    session = make_session(user, [5], action=MagicMock(id=7))

    await chamar_rota(
        app_teste, "GET", "/actions/7?group_id=99", session, token_for(user)
    )

    statement = session.scalar.await_args.args[0]
    assert statement.compile().params["group_id_1"] == [5]


@pytest.mark.parametrize("action_id", [7, 999], ids=["other-group", "missing"])
async def test_an_action_of_another_group_is_a_404_like_a_missing_one(
    action_id: int,
) -> None:
    user = make_user(Role.COORDINATOR)
    session = make_session(user, [5], action=None)

    response = await chamar_rota(
        app_teste, "GET", f"/actions/{action_id}", session, token_for(user)
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Ação não encontrada"
