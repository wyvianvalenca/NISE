"""GET /api/actions: the actions of the coordinator's group (#217, RF-F30.10, RN-37).

The rules (status, filter, search, counts, order) are tested on
`build_action_list` with a fixed "today". The route tests use a fake session and
check who is let in, which group the query asks for and the shape of the answer.
"""

from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.main import app
from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionStatus,
    ActionType,
    ActionVisibility,
)
from app.modules.actions.service import (
    ActionRow,
    build_action_list,
    today_in_maceio,
)
from app.users.models import Role
from tests.actions_helpers import make_session, make_user, token
from tests.helpers import chamar_rota

TODAY = date(2030, 6, 15)
DAY = timedelta(days=1)


def make_action(
    action_id: int,
    name: str = "Oficina de Robotica",
    starts_on: date = TODAY + 10 * DAY,
    attendance: bool = False,
) -> Action:
    return Action(
        id=action_id,
        group_id=5,
        name=name,
        type=ActionType.OFICINA,
        starts_on=starts_on,
        ends_on=starts_on,
        format=ActionFormat.IN_PERSON,
        city_ibge_code=2704302,
        visibility=ActionVisibility.OPEN,
        registrations_open=True,
        attendance_registered_at=(
            datetime(2030, 6, 16, tzinfo=UTC) if attendance else None
        ),
    )


def make_row(
    action_id: int,
    registered: int = 0,
    attended: int = 0,
    **fields: object,
) -> ActionRow:
    return ActionRow(
        make_action(action_id, **fields),  # type: ignore[arg-type]
        registered,
        attended,
        "Maceió, AL",
    )


def ids(result_items: list) -> list[int]:  # type: ignore[type-arg]
    return [item.id for item in result_items]


# --- The four statuses, including the day of the event ------------------------


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        (make_row(1, registered=0), ActionStatus.AWAITING_REGISTRATIONS),
        (make_row(2, registered=3), ActionStatus.AWAITING_EVENT),
        (
            make_row(3, registered=3, starts_on=TODAY),
            ActionStatus.AWAITING_ATTENDANCE,
        ),
        (
            make_row(4, registered=3, starts_on=TODAY - DAY),
            ActionStatus.AWAITING_ATTENDANCE,
        ),
        (
            make_row(5, registered=3, starts_on=TODAY, attendance=True),
            ActionStatus.CONCLUDED,
        ),
        (
            make_row(6, registered=0, starts_on=TODAY, attendance=True),
            ActionStatus.CONCLUDED,
        ),
        (make_row(7, registered=0, starts_on=TODAY), ActionStatus.AWAITING_ATTENDANCE),
        (make_row(8, registered=3, starts_on=TODAY + DAY), ActionStatus.AWAITING_EVENT),
    ],
    ids=[
        "no-girls",
        "girls-and-future",
        "event-day",
        "past-without-attendance",
        "event-day-with-attendance",
        "concluded-without-girls",
        "event-day-without-girls",
        "tomorrow",
    ],
)
def test_each_row_has_the_status_of_compute_status(
    row: ActionRow, expected: ActionStatus
) -> None:
    result = build_action_list([row], TODAY)

    assert result.items[0].status is expected


# --- Counts of girls ----------------------------------------------------------


def test_the_row_carries_the_registered_count() -> None:
    result = build_action_list([make_row(1, registered=26)], TODAY)

    assert result.items[0].registered_count == 26


def test_an_action_with_attendance_saved_carries_the_present_count() -> None:
    row = make_row(
        1, registered=30, attended=22, starts_on=TODAY - DAY, attendance=True
    )

    item = build_action_list([row], TODAY).items[0]

    assert item.status is ActionStatus.CONCLUDED
    assert (item.registered_count, item.attended_count) == (30, 22)


def test_attendance_saved_with_nobody_present_says_zero_not_null() -> None:
    row = make_row(1, registered=30, attended=0, starts_on=TODAY - DAY, attendance=True)

    assert build_action_list([row], TODAY).items[0].attended_count == 0


def test_without_attendance_the_present_count_is_null() -> None:
    row = make_row(1, registered=30, starts_on=TODAY - DAY)

    assert build_action_list([row], TODAY).items[0].attended_count is None


# --- Filter by status and the chip counts -------------------------------------


def mixed_rows() -> list[ActionRow]:
    return [
        make_row(1, name="Oficina A"),
        make_row(2, name="Oficina B"),
        make_row(3, name="Palestra C", registered=4),
        make_row(4, name="Visita D", registered=2, starts_on=TODAY - 3 * DAY),
        make_row(
            5,
            name="Oficina E",
            registered=2,
            starts_on=TODAY - 9 * DAY,
            attendance=True,
        ),
        make_row(
            6, name="Visita F", registered=2, starts_on=TODAY - 2 * DAY, attendance=True
        ),
    ]


def test_the_counts_of_every_status_and_of_all() -> None:
    counts = build_action_list(mixed_rows(), TODAY).counts

    assert counts.model_dump() == {
        "all": 6,
        "awaiting_registrations": 2,
        "awaiting_event": 1,
        "awaiting_attendance": 1,
        "concluded": 2,
    }


def test_picking_a_status_shows_only_that_status() -> None:
    result = build_action_list(mixed_rows(), TODAY, ActionStatus.CONCLUDED)

    assert ids(result.items) == [6, 5]
    assert {item.status for item in result.items} == {ActionStatus.CONCLUDED}


def test_the_counts_do_not_change_with_the_status_filter() -> None:
    everything = build_action_list(mixed_rows(), TODAY).counts
    only_concluded = build_action_list(
        mixed_rows(), TODAY, ActionStatus.CONCLUDED
    ).counts

    assert only_concluded == everything


def test_the_counts_follow_the_search() -> None:
    result = build_action_list(mixed_rows(), TODAY, search="oficina")

    assert result.counts.model_dump() == {
        "all": 3,
        "awaiting_registrations": 2,
        "awaiting_event": 0,
        "awaiting_attendance": 0,
        "concluded": 1,
    }


def test_the_search_and_the_status_filter_combine() -> None:
    result = build_action_list(mixed_rows(), TODAY, ActionStatus.CONCLUDED, "visita")

    assert ids(result.items) == [6]
    assert result.counts.all == 2


# --- Search by name -----------------------------------------------------------


@pytest.mark.parametrize(
    "search",
    ["robótica", "robotica", "ROBOTICA", "  Robo  ", "ROBÓ"],
    ids=["with-accent", "without", "upper", "spaces", "upper-accent"],
)
def test_the_search_ignores_accents_and_case(search: str) -> None:
    rows = [make_row(1, name="Oficina de Robótica"), make_row(2, name="Palestra")]

    assert ids(build_action_list(rows, TODAY, search=search).items) == [1]


def test_a_name_without_accent_is_found_with_an_accented_search() -> None:
    rows = [make_row(1, name="Hackathon Sao Jose")]

    assert ids(build_action_list(rows, TODAY, search="São José").items) == [1]


@pytest.mark.parametrize("search", [None, "", "   "])
def test_an_empty_search_shows_everything(search: str | None) -> None:
    assert len(build_action_list(mixed_rows(), TODAY, search=search).items) == 6


def test_a_search_with_no_match_shows_nothing_and_zero_counts() -> None:
    result = build_action_list(mixed_rows(), TODAY, search="culinaria")

    assert result.items == []
    assert result.counts.all == 0


# --- Order (proposal of #215, to be confirmed with design) --------------------


def test_upcoming_come_nearest_first_and_concluded_most_recent_first() -> None:
    rows = [
        make_row(1, registered=1, starts_on=TODAY + 30 * DAY),
        make_row(2, registered=1, starts_on=TODAY + 2 * DAY),
        make_row(3, registered=1, starts_on=TODAY + 10 * DAY),
        make_row(4, registered=1, starts_on=TODAY - 20 * DAY, attendance=True),
        make_row(5, registered=1, starts_on=TODAY - 2 * DAY, attendance=True),
        make_row(6, registered=1, starts_on=TODAY - 9 * DAY, attendance=True),
    ]

    assert ids(build_action_list(rows, TODAY).items) == [2, 3, 1, 5, 6, 4]


def test_the_groups_follow_the_flow_and_the_order_is_stable_on_a_tie() -> None:
    rows = [
        make_row(10, registered=1, starts_on=TODAY - 20 * DAY, attendance=True),
        make_row(9, registered=1, starts_on=TODAY - 2 * DAY),
        make_row(8, registered=1, starts_on=TODAY + 5 * DAY),
        make_row(7, registered=0, starts_on=TODAY + 5 * DAY),
        make_row(6, registered=0, starts_on=TODAY + 5 * DAY),
    ]

    assert ids(build_action_list(rows, TODAY).items) == [6, 7, 8, 9, 10]


# --- The route ----------------------------------------------------------------


def listing_session(group_ids: list[int], rows: list[ActionRow]) -> AsyncMock:
    session = make_session(group_ids)
    session.execute.return_value = MagicMock(
        all=MagicMock(
            return_value=[
                (row.action, row.registered_count, row.attended_count, "Maceió", "AL")
                if row.city_label
                else (row.action, row.registered_count, row.attended_count, None, None)
                for row in rows
            ]
        )
    )
    return session


async def test_the_route_answers_the_items_and_the_counts() -> None:
    today = today_in_maceio()
    session = listing_session(
        [5],
        [
            make_row(1, name="Oficina A", starts_on=today + 5 * DAY),
            make_row(2, name="Palestra B", registered=2, starts_on=today),
        ],
    )

    response = await chamar_rota(app, "GET", "/api/actions", session, token())

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body["items"]] == [1, 2]
    assert body["items"][0]["status"] == "awaiting_registrations"
    assert body["items"][0]["city_label"] == "Maceió, AL"
    assert body["items"][1]["status"] == "awaiting_attendance"
    assert body["counts"]["all"] == 2


async def test_the_route_filters_by_status_and_search_from_the_query_string() -> None:
    today = today_in_maceio()
    session = listing_session(
        [5],
        [
            make_row(1, name="Oficina de Robótica", starts_on=today + 5 * DAY),
            make_row(
                2, name="Oficina de Dados", registered=2, starts_on=today + 5 * DAY
            ),
            make_row(3, name="Palestra", starts_on=today + 5 * DAY),
        ],
    )

    response = await chamar_rota(
        app,
        "GET",
        "/api/actions?status=awaiting_registrations&search=oficina",
        session,
        token(),
    )

    body = response.json()
    assert [item["id"] for item in body["items"]] == [1]
    assert body["counts"]["awaiting_registrations"] == 1
    assert body["counts"]["awaiting_event"] == 1


async def test_a_status_outside_the_four_is_422() -> None:
    session = listing_session([5], [])

    response = await chamar_rota(
        app, "GET", "/api/actions?status=draft", session, token()
    )

    assert response.status_code == 422


async def test_the_query_asks_only_for_the_coordinators_group() -> None:
    session = listing_session([5], [])

    await chamar_rota(app, "GET", "/api/actions?group_id=99", session, token())

    statement = session.execute.await_args.args[0]
    params = statement.compile().params
    assert params["group_id_1"] == 5
    assert 99 not in params.values()


async def test_coordinator_of_two_groups_gets_409_and_no_query_runs() -> None:
    session = listing_session([5, 6], [])

    response = await chamar_rota(app, "GET", "/api/actions", session, token())

    assert response.status_code == 409
    session.execute.assert_not_awaited()


async def test_without_a_group_403_without_login_401_and_a_girl_403() -> None:
    no_group = await chamar_rota(
        app, "GET", "/api/actions", listing_session([], []), token()
    )
    anonymous = await chamar_rota(
        app, "GET", "/api/actions", listing_session([5], []), None
    )
    girl_session = listing_session([5], [])
    girl_session.get.side_effect = None
    girl_session.get.return_value = make_user(Role.GIRL)
    girl = await chamar_rota(app, "GET", "/api/actions", girl_session, token())

    assert no_group.status_code == 403
    assert anonymous.status_code == 401
    assert girl.status_code == 403
    girl_session.execute.assert_not_awaited()


def test_the_route_is_in_openapi_with_its_filters() -> None:
    operation = app.openapi()["paths"]["/api/actions"]["get"]

    assert "Actions" in operation["tags"]
    query = {p["name"] for p in operation["parameters"] if p["in"] == "query"}
    assert query == {"status", "search"}
