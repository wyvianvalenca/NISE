"""Fake session and payloads shared by the action route tests (#213 onwards).

The session is fake, so no test needs Postgres: what is checked is who is let in,
what the route asks of the session and what it answers. All data is fictional.
"""

from collections.abc import Sequence
from typing import Any
from unittest.mock import AsyncMock, MagicMock

from app.auth.utils import create_access_token
from app.modules.actions.models import Action
from app.modules.cities.models import City
from app.users.models import Role, User

MACEIO = City(id=2704302, name="Maceió", state="AL", search_name="maceio, al")
NEW_ACTION_ID = 42


def make_user(role: Role = Role.COORDINATOR) -> User:
    return User(id=1, email="coord@exemplo.com", name="Coord Ficticia", role=role)


def token() -> str:
    return create_access_token(1)


def make_session(
    group_ids: Sequence[int] = (5,),
    *,
    user: User | None = None,
    city: City | None = None,
    action: Action | None = None,
    scalar_results: Sequence[Any] | None = None,
) -> AsyncMock:
    """A session for a signed-in coordinator of `group_ids`.

    `session.get` answers the user and, for a `City`, the given city (None means
    "outside the IBGE list"). `session.scalar` answers the action of the group
    lookup, or `scalar_results` in order when a route runs several queries.
    """
    signed_in = user if user is not None else make_user()

    async def get(model: type, ident: object) -> object:
        return city if model is City else signed_in

    session = AsyncMock()
    session.get.side_effect = get
    session.scalars.return_value = MagicMock(
        all=MagicMock(return_value=list(group_ids))
    )
    if scalar_results is not None:
        session.scalar.side_effect = list(scalar_results)
    else:
        session.scalar.return_value = action

    def give_id(row: object) -> None:
        if isinstance(row, Action) and row.id is None:
            row.id = NEW_ACTION_ID

    session.add = MagicMock(side_effect=give_id)
    return session


def valid_payload(**changes: object) -> dict[str, object]:
    """A form that passes every rule: an open, in-person, one-day action."""
    payload: dict[str, object] = {
        "name": "Oficina de Robotica",
        "type": "oficina",
        "starts_on": "2030-05-10",
        "format": "in_person",
        "city_ibge_code": MACEIO.id,
        "visibility": "open",
        "registration_url": "https://exemplo.com/inscricao",
    }
    payload.update(changes)
    return payload


def saved_action(session: AsyncMock) -> Action:
    """The action the route handed to `session.add`."""
    action = session.add.call_args.args[0]
    assert isinstance(action, Action)
    return action
