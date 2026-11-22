"""POST /api/actions: create an action in the coordinator's group (#213, RF-F30.01).

The session is fake (see actions_helpers.py), so no test needs Postgres.
"""

from collections.abc import Mapping
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.main import app
from app.modules.actions.models import (
    ActionFormat,
    ActionType,
    ActionVisibility,
)
from app.modules.girls.models import StudyStage, Topic
from app.users.models import Role
from tests.actions_helpers import (
    MACEIO,
    NEW_ACTION_ID,
    make_session,
    make_user,
    saved_action,
    token,
    valid_payload,
)
from tests.helpers import chamar_rota


async def create(session: AsyncMock, payload: Mapping[str, object]) -> Response:
    return await chamar_rota(app, "POST", "/api/actions", session, token(), payload)


def error_fields(response: Response) -> dict[str, str]:
    return {item["loc"][1]: item["msg"] for item in response.json()["detail"]}


# --- Happy path and what the answer carries ----------------------------------


async def test_required_fields_only_create_an_action_in_the_coordinators_group() -> (
    None
):
    session = make_session([5], city=MACEIO)

    response = await create(session, valid_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == NEW_ACTION_ID
    assert body["name"] == "Oficina de Robotica"
    assert body["status"] == "awaiting_registrations"
    assert body["registrations_open"] is True
    assert body["topics"] == []
    assert body["audiences"] == []
    action = saved_action(session)
    assert action.group_id == 5
    session.commit.assert_awaited_once()


async def test_the_answer_has_the_city_in_the_label_format_for_the_notice() -> None:
    response = await create(make_session(city=MACEIO), valid_payload())

    assert response.json()["city_label"] == "Maceió, AL"
    assert response.json()["city_ibge_code"] == MACEIO.id


async def test_optional_details_are_saved() -> None:
    session = make_session(city=MACEIO)

    response = await create(
        session,
        valid_payload(
            starts_at_time="14:00:00",
            ends_at_time="17:30:00",
            address="Rua Ficticia, 10",
            description="Uma tarde de robotica.",
            audiences=["medio", "tecnico"],
        ),
    )

    assert response.status_code == 201
    action = saved_action(session)
    assert action.address == "Rua Ficticia, 10"
    assert action.description == "Uma tarde de robotica."
    assert [row.stage for row in action.audiences] == [
        StudyStage.MEDIO,
        StudyStage.TECNICO,
    ]


# --- Group: never from the request (RN-14) ------------------------------------


async def test_a_group_sent_in_the_body_is_ignored() -> None:
    session = make_session([5], city=MACEIO)

    response = await create(session, valid_payload(group_id=99))

    assert response.status_code == 201
    assert saved_action(session).group_id == 5


async def test_a_group_sent_in_the_query_is_ignored() -> None:
    session = make_session([5], city=MACEIO)

    response = await chamar_rota(
        app,
        "POST",
        "/api/actions?group_id=99",
        session,
        token(),
        valid_payload(),
    )

    assert response.status_code == 201
    assert saved_action(session).group_id == 5


async def test_coordinator_of_two_groups_gets_409_and_nothing_is_saved() -> None:
    session = make_session([5, 6], city=MACEIO)

    response = await create(session, valid_payload())

    assert response.status_code == 409
    session.add.assert_not_called()


async def test_coordinator_without_a_group_gets_403() -> None:
    session = make_session([], city=MACEIO)

    response = await create(session, valid_payload())

    assert response.status_code == 403
    assert response.json()["detail"] == "Sem grupo"
    session.add.assert_not_called()


async def test_a_girl_gets_403_and_without_login_401() -> None:
    girl_session = make_session(user=make_user(Role.GIRL), city=MACEIO)
    girl = await create(girl_session, valid_payload())
    anonymous = await chamar_rota(
        app, "POST", "/api/actions", make_session(), None, valid_payload()
    )

    assert girl.status_code == 403
    assert anonymous.status_code == 401
    girl_session.add.assert_not_called()


# --- Required fields ----------------------------------------------------------


@pytest.mark.parametrize("field", ["name", "type", "starts_on", "format", "visibility"])
async def test_each_required_field_missing_is_422_and_nothing_is_saved(
    field: str,
) -> None:
    payload = valid_payload()
    del payload[field]
    session = make_session(city=MACEIO)

    response = await create(session, payload)

    assert response.status_code == 422
    session.add.assert_not_called()


async def test_a_blank_name_is_refused() -> None:
    response = await create(make_session(city=MACEIO), valid_payload(name="   "))

    assert response.status_code == 422


async def test_a_type_outside_the_fixed_list_is_refused() -> None:
    session = make_session(city=MACEIO)

    response = await create(session, valid_payload(type="festa"))

    assert response.status_code == 422
    session.add.assert_not_called()


@pytest.mark.parametrize("action_type", [member.value for member in ActionType])
async def test_every_type_of_the_fixed_list_is_accepted(action_type: str) -> None:
    response = await create(make_session(city=MACEIO), valid_payload(type=action_type))

    assert response.status_code == 201


# --- Registration link --------------------------------------------------------


@pytest.mark.parametrize("missing", [None, "", "   "], ids=["null", "empty", "blank"])
async def test_an_open_action_without_a_link_is_refused(missing: str | None) -> None:
    session = make_session(city=MACEIO)

    response = await create(
        session, valid_payload(visibility="open", registration_url=missing)
    )

    assert response.status_code == 422
    assert error_fields(response) == {
        "registration_url": "Obrigatório pra ações abertas"
    }
    session.add.assert_not_called()


async def test_a_closed_action_without_a_link_is_saved() -> None:
    session = make_session(city=MACEIO)

    response = await create(
        session, valid_payload(visibility="closed", registration_url=None)
    )

    assert response.status_code == 201
    assert saved_action(session).registration_url is None
    assert saved_action(session).visibility is ActionVisibility.CLOSED


@pytest.mark.parametrize(
    "url",
    ["http://exemplo.com", "exemplo.com/inscricao", "ftp://exemplo.com", "https://"],
)
@pytest.mark.parametrize("visibility", ["open", "closed"])
async def test_a_link_without_https_is_refused_for_open_and_closed(
    url: str, visibility: str
) -> None:
    session = make_session(city=MACEIO)

    response = await create(
        session, valid_payload(visibility=visibility, registration_url=url)
    )

    assert response.status_code == 422
    assert error_fields(response) == {
        "registration_url": "O link precisa começar com https://"
    }
    session.add.assert_not_called()


# --- Dates --------------------------------------------------------------------


async def test_a_one_day_action_ends_on_its_start_day() -> None:
    session = make_session(city=MACEIO)

    response = await create(session, valid_payload(starts_on="2030-05-10"))

    assert response.status_code == 201
    assert response.json()["ends_on"] == "2030-05-10"
    assert saved_action(session).ends_on == saved_action(session).starts_on


async def test_an_end_equal_to_the_start_is_a_one_day_action() -> None:
    response = await create(
        make_session(city=MACEIO),
        valid_payload(starts_on="2030-05-10", ends_on="2030-05-10"),
    )

    assert response.status_code == 201


async def test_a_several_day_action_keeps_its_end_date() -> None:
    session = make_session(city=MACEIO)

    response = await create(
        session, valid_payload(starts_on="2030-05-10", ends_on="2030-05-12")
    )

    assert response.status_code == 201
    assert response.json()["ends_on"] == "2030-05-12"


async def test_an_end_before_the_start_is_refused() -> None:
    session = make_session(city=MACEIO)

    response = await create(
        session, valid_payload(starts_on="2030-05-10", ends_on="2030-05-09")
    )

    assert response.status_code == 422
    assert list(error_fields(response)) == ["ends_on"]
    session.add.assert_not_called()


async def test_every_broken_field_is_reported_at_once() -> None:
    response = await create(
        make_session(city=MACEIO),
        valid_payload(
            starts_on="2030-05-10",
            ends_on="2030-05-09",
            registration_url="http://exemplo.com",
        ),
    )

    assert set(error_fields(response)) == {"ends_on", "registration_url"}


# --- City ---------------------------------------------------------------------


async def test_a_city_outside_the_ibge_list_is_refused() -> None:
    session = make_session(city=None)

    response = await create(session, valid_payload(city_ibge_code=1234567))

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_city"}
    session.add.assert_not_called()


async def test_an_in_person_action_without_a_city_is_refused() -> None:
    session = make_session()

    response = await create(session, valid_payload(city_ibge_code=None))

    assert response.status_code == 422
    assert list(error_fields(response)) == ["city_ibge_code"]
    session.add.assert_not_called()


async def test_an_online_action_without_a_city_is_saved_with_no_city_label() -> None:
    session = make_session()

    response = await create(
        session, valid_payload(format="online", city_ibge_code=None)
    )

    assert response.status_code == 201
    assert response.json()["city_label"] is None
    assert response.json()["city_ibge_code"] is None
    assert saved_action(session).format is ActionFormat.ONLINE


async def test_an_online_action_with_a_city_is_refused() -> None:
    session = make_session(city=MACEIO)

    response = await create(session, valid_payload(format="online"))

    assert response.status_code == 422
    assert list(error_fields(response)) == ["city_ibge_code"]
    session.add.assert_not_called()


# --- Description --------------------------------------------------------------


async def test_a_description_of_300_characters_is_saved_and_301_is_refused() -> None:
    accepted = await create(
        make_session(city=MACEIO), valid_payload(description="a" * 300)
    )
    refused_session = make_session(city=MACEIO)
    refused = await create(refused_session, valid_payload(description="a" * 301))

    assert accepted.status_code == 201
    assert refused.status_code == 422
    refused_session.add.assert_not_called()


# --- Tags (the 8 topics) ------------------------------------------------------


@pytest.mark.parametrize(
    "topics",
    [[], ["robotica"], ["robotica", "dados", "jogos"]],
    ids=["none", "one", "several"],
)
async def test_an_action_takes_none_one_or_several_tags(topics: list[str]) -> None:
    session = make_session(city=MACEIO)

    response = await create(session, valid_payload(topics=topics))

    assert response.status_code == 201
    assert response.json()["topics"] == topics
    assert [row.topic.value for row in saved_action(session).topics] == topics


async def test_every_one_of_the_eight_topics_is_accepted() -> None:
    every = [topic.value for topic in Topic]

    response = await create(make_session(city=MACEIO), valid_payload(topics=every))

    assert response.status_code == 201
    assert response.json()["topics"] == every


@pytest.mark.parametrize("topic", ["culinaria", "Robotica", "", "programação"])
async def test_a_tag_outside_the_eight_topics_is_refused(topic: str) -> None:
    session = make_session(city=MACEIO)

    response = await create(session, valid_payload(topics=["robotica", topic]))

    assert response.status_code == 422
    session.add.assert_not_called()


async def test_a_repeated_tag_counts_once() -> None:
    session = make_session(city=MACEIO)

    response = await create(session, valid_payload(topics=["dados", "dados"]))

    assert response.status_code == 201
    assert response.json()["topics"] == ["dados"]


async def test_an_audience_outside_the_study_stages_is_refused() -> None:
    session = make_session(city=MACEIO)

    response = await create(session, valid_payload(audiences=["doutorado"]))

    assert response.status_code == 422
    session.add.assert_not_called()


# --- OpenAPI ------------------------------------------------------------------


def test_the_route_is_in_openapi_under_the_actions_tag() -> None:
    operation = app.openapi()["paths"]["/api/actions"]["post"]

    assert "Actions" in operation["tags"]
    assert "201" in operation["responses"]
