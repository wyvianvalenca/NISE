"""DELETE /api/actions/{id}: delete an action of the group (#227, RF-F30.12, RN-15).

The session is fake (see actions_helpers.py). The registrations go away through
the database's CASCADE, which a fake session cannot run, so a schema test pins
that wiring and the route tests pin what the route asks of the session.
"""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.db.base import Base
from app.main import app
from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionType,
    ActionVisibility,
    Participation,
)
from app.modules.girls.models import Girl
from app.users.models import Role
from tests.actions_helpers import make_session, make_user, token
from tests.helpers import chamar_rota


def make_action(attendance: bool = False) -> Action:
    return Action(
        id=7,
        group_id=5,
        name="Oficina de Robotica",
        type=ActionType.OFICINA,
        starts_on=date(2030, 5, 10),
        ends_on=date(2030, 5, 10),
        format=ActionFormat.ONLINE,
        visibility=ActionVisibility.CLOSED,
        registrations_open=True,
        attendance_registered_at=(
            datetime(2030, 5, 11, tzinfo=UTC) if attendance else None
        ),
    )


async def delete(session: AsyncMock, action_id: int = 7) -> Response:
    return await chamar_rota(
        app, "DELETE", f"/api/actions/{action_id}", session, token()
    )


async def test_an_action_with_no_registrations_is_deleted() -> None:
    action = make_action()
    session = make_session(action=action)

    response = await delete(session)

    assert response.status_code == 204
    assert response.content == b""
    session.delete.assert_awaited_once_with(action)
    session.commit.assert_awaited_once()


async def test_an_action_with_23_registrations_is_deleted_all_the_same() -> None:
    action = make_action()
    session = make_session(action=action)

    response = await delete(session)

    assert response.status_code == 204
    session.delete.assert_awaited_once_with(action)


async def test_an_action_with_attendance_saved_is_refused_with_409() -> None:
    action = make_action(attendance=True)
    session = make_session(action=action)

    response = await delete(session)

    assert response.status_code == 409
    assert "presença" in response.json()["detail"]
    session.delete.assert_not_awaited()
    session.commit.assert_not_awaited()


async def test_the_route_deletes_the_action_and_nothing_else() -> None:
    session = make_session(action=make_action())

    await delete(session)

    session.execute.assert_not_awaited()
    assert session.delete.await_count == 1
    assert isinstance(session.delete.await_args.args[0], Action)


def test_the_registrations_go_with_the_action_and_no_girl_record_does() -> None:
    action_fks = [
        (table.name, fk.ondelete)
        for table in Base.metadata.tables.values()
        for fk in table.foreign_keys
        if fk.column.table.name == "actions"
    ]

    assert ("participations", "CASCADE") in action_fks
    assert {ondelete for _, ondelete in action_fks} == {"CASCADE"}
    assert "girls" not in {table for table, _ in action_fks}
    girls_fk_targets = {fk.column.table.name for fk in Girl.__table__.foreign_keys}
    assert "actions" not in girls_fk_targets
    participation_targets = {
        fk.column.table.name: fk.ondelete for fk in Participation.__table__.foreign_keys
    }
    assert participation_targets == {"girls": "CASCADE", "actions": "CASCADE"}


async def test_an_action_of_another_group_is_404_and_nothing_is_deleted() -> None:
    session = make_session([5], action=None)

    response = await delete(session)

    assert response.status_code == 404
    assert response.json()["detail"] == "Ação não encontrada"
    session.delete.assert_not_awaited()
    session.commit.assert_not_awaited()


async def test_the_lookup_is_filtered_by_the_coordinators_groups() -> None:
    session = make_session([5, 6], action=make_action())

    await delete(session)

    lookup = session.scalar.await_args.args[0]
    assert lookup.compile().params == {"id_1": 7, "group_id_1": [5, 6]}


@pytest.mark.parametrize(
    ("role", "expected"), [(Role.GIRL, 403), (None, 401)], ids=["girl", "anonymous"]
)
async def test_a_girl_gets_403_and_without_login_401(
    role: Role | None, expected: int
) -> None:
    session = make_session(user=make_user(role or Role.GIRL), action=make_action())

    if role is None:
        response = await chamar_rota(app, "DELETE", "/api/actions/7", session, None)
    else:
        response = await delete(session)

    assert response.status_code == expected
    session.delete.assert_not_awaited()


def test_the_route_is_in_openapi_with_its_refusals() -> None:
    operation = app.openapi()["paths"]["/api/actions/{action_id}"]["delete"]

    assert "Actions" in operation["tags"]
    assert {"204", "404", "409"} <= set(operation["responses"])
