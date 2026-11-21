"""PUT /api/actions/{id}: edit an action of the coordinator's group (#223, RF-F30.11).

The session is fake (see actions_helpers.py). The action the group lookup finds is
a real `Action` object, so what the edit did to it can be read back.
"""

from collections.abc import Mapping
from datetime import date
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.main import app
from app.modules.actions.models import (
    Action,
    ActionAudience,
    ActionFormat,
    ActionTopic,
    ActionType,
    ActionVisibility,
)
from app.modules.cities.models import City
from app.modules.girls.models import StudyStage, Topic
from app.users.models import Role
from tests.actions_helpers import (
    MACEIO,
    make_session,
    make_user,
    token,
    valid_payload,
)
from tests.helpers import chamar_rota

ARAPIRACA = City(id=2700300, name="Arapiraca", state="AL", search_name="arapiraca, al")


def existing_action(**changes: object) -> Action:
    fields: dict[str, object] = {
        "id": 7,
        "group_id": 5,
        "name": "Oficina de Robotica",
        "type": ActionType.OFICINA,
        "starts_on": date(2030, 5, 10),
        "ends_on": date(2030, 5, 10),
        "format": ActionFormat.IN_PERSON,
        "city_ibge_code": MACEIO.id,
        "visibility": ActionVisibility.OPEN,
        "registration_url": "https://exemplo.com/inscricao",
        "registrations_open": True,
        "topics": [ActionTopic(topic=Topic.ROBOTICA), ActionTopic(topic=Topic.DADOS)],
        "audiences": [ActionAudience(stage=StudyStage.MEDIO)],
    }
    fields.update(changes)
    return Action(**fields)


def edit_session(
    action: Action | None, registered: int = 0, city: City | None = MACEIO
) -> AsyncMock:
    # session.scalar answers the group lookup first and then the registered count.
    return make_session(city=city, scalar_results=[action, registered])


async def edit(
    session: AsyncMock, payload: Mapping[str, object], action_id: int = 7
) -> Response:
    return await chamar_rota(
        app, "PUT", f"/api/actions/{action_id}", session, token(), payload
    )


def snapshot(action: Action) -> tuple[object, ...]:
    return (
        action.name,
        action.type,
        action.starts_on,
        action.ends_on,
        action.city_ibge_code,
        action.registration_url,
        [row.topic for row in action.topics],
        [row.stage for row in action.audiences],
    )


# --- What can change ----------------------------------------------------------


async def test_the_name_changes() -> None:
    action = existing_action()
    session = edit_session(action)

    response = await edit(session, valid_payload(name="Oficina de Dados"))

    assert response.status_code == 200
    assert response.json()["name"] == "Oficina de Dados"
    assert action.name == "Oficina de Dados"
    session.commit.assert_awaited_once()


async def test_the_type_changes() -> None:
    action = existing_action()

    response = await edit(edit_session(action), valid_payload(type="palestra"))

    assert response.status_code == 200
    assert action.type is ActionType.PALESTRA
    assert response.json()["type"] == "palestra"


async def test_the_city_changes_and_the_answer_names_the_new_one() -> None:
    action = existing_action()

    response = await edit(
        edit_session(action, city=ARAPIRACA),
        valid_payload(city_ibge_code=ARAPIRACA.id),
    )

    assert response.status_code == 200
    assert action.city_ibge_code == ARAPIRACA.id
    assert response.json()["city_label"] == "Arapiraca, AL"


async def test_an_in_person_action_can_become_online_and_loses_its_city() -> None:
    action = existing_action()

    response = await edit(
        edit_session(action), valid_payload(format="online", city_ibge_code=None)
    )

    assert response.status_code == 200
    assert action.format is ActionFormat.ONLINE
    assert action.city_ibge_code is None
    assert response.json()["city_label"] is None


async def test_tags_are_replaced_kept_and_removed() -> None:
    action = existing_action()
    kept = action.topics[1]

    response = await edit(
        edit_session(action), valid_payload(topics=["dados", "jogos"])
    )

    assert response.status_code == 200
    assert [row.topic for row in action.topics] == [Topic.DADOS, Topic.JOGOS]
    assert action.topics[0] is kept
    assert response.json()["topics"] == ["dados", "jogos"]


async def test_sending_no_tags_removes_them_all() -> None:
    action = existing_action()

    response = await edit(edit_session(action), valid_payload(topics=[]))

    assert response.status_code == 200
    assert action.topics == []
    assert response.json()["topics"] == []


async def test_the_audience_changes() -> None:
    action = existing_action()

    response = await edit(
        edit_session(action), valid_payload(audiences=["tecnico", "graduacao"])
    )

    assert response.status_code == 200
    assert [row.stage for row in action.audiences] == [
        StudyStage.TECNICO,
        StudyStage.GRADUACAO,
    ]


async def test_a_one_day_action_can_become_several_days() -> None:
    action = existing_action()

    response = await edit(edit_session(action), valid_payload(ends_on="2030-05-12"))

    assert response.status_code == 200
    assert action.ends_on == date(2030, 5, 12)


# --- Same validation as the creation ------------------------------------------


@pytest.mark.parametrize(
    ("changes", "field"),
    [
        ({"ends_on": "2030-05-09"}, "ends_on"),
        ({"registration_url": "http://exemplo.com"}, "registration_url"),
        ({"registration_url": None}, "registration_url"),
        ({"format": "online"}, "city_ibge_code"),
        ({"city_ibge_code": None}, "city_ibge_code"),
        ({"description": "a" * 301}, "description"),
        ({"topics": ["culinaria"]}, "topics"),
        ({"type": "festa"}, "type"),
    ],
)
async def test_a_change_that_breaks_a_rule_saves_nothing(
    changes: dict[str, object], field: str
) -> None:
    action = existing_action()
    before = snapshot(action)
    session = edit_session(action)

    response = await edit(session, valid_payload(name="Outro nome", **changes))

    assert response.status_code == 422
    assert any(item["loc"][1] == field for item in response.json()["detail"])
    assert snapshot(action) == before
    session.commit.assert_not_awaited()


async def test_a_city_outside_the_ibge_list_saves_nothing() -> None:
    action = existing_action()
    before = snapshot(action)
    session = edit_session(action, city=None)

    response = await edit(session, valid_payload(city_ibge_code=1234567))

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_city"}
    assert snapshot(action) == before
    session.commit.assert_not_awaited()


# --- The girls already registered stay ----------------------------------------


async def test_the_registered_girls_are_counted_and_never_touched() -> None:
    action = existing_action()
    session = edit_session(action, registered=23)

    response = await edit(session, valid_payload(name="Novo nome"))

    assert response.status_code == 200
    assert response.json()["status"] == "awaiting_event"
    session.delete.assert_not_awaited()
    session.execute.assert_not_awaited()
    session.add.assert_not_called()
    statement = session.scalar.await_args_list[1].args[0]
    assert str(statement).startswith("SELECT count(*)")
    assert "DELETE" not in str(statement).upper()


# --- Group --------------------------------------------------------------------


async def test_the_action_is_found_only_among_the_coordinators_groups() -> None:
    action = existing_action()
    session = edit_session(action)

    await edit(session, valid_payload())

    lookup = session.scalar.await_args_list[0].args[0]
    assert lookup.compile().params == {"id_1": 7, "group_id_1": [5]}


async def test_an_action_of_another_group_is_404_and_nothing_changes() -> None:
    session = edit_session(None)

    response = await edit(session, valid_payload(name="Invasao"))

    assert response.status_code == 404
    assert response.json()["detail"] == "Ação não encontrada"
    session.commit.assert_not_awaited()


async def test_a_group_in_the_body_does_not_move_the_action() -> None:
    action = existing_action()

    response = await edit(edit_session(action), valid_payload(group_id=99))

    assert response.status_code == 200
    assert action.group_id == 5


async def test_a_girl_gets_403_and_without_login_401() -> None:
    session = make_session(user=make_user(Role.GIRL), scalar_results=[None, 0])
    girl = await edit(session, valid_payload())
    anonymous = await chamar_rota(
        app, "PUT", "/api/actions/7", edit_session(None), None, valid_payload()
    )

    assert girl.status_code == 403
    assert anonymous.status_code == 401
    session.commit.assert_not_awaited()


def test_the_route_is_in_openapi() -> None:
    operation = app.openapi()["paths"]["/api/actions/{action_id}"]["put"]

    assert "Actions" in operation["tags"]
