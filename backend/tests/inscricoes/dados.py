"""Fictional data for the registration tests (never real girls)."""

from collections.abc import Callable
from datetime import UTC, date, datetime
from itertools import count

from httpx2 import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionType,
    ActionVisibility,
    Participation,
)
from app.modules.girls.models import Girl, StudyStage
from app.modules.groups.models import Group, GroupCoordinator
from app.users.models import Role, User

# The day of the event of the actions these tests create. Every test passes
# "today" explicitly, so none of them depends on the real date.
EVENT_DAY = date(2026, 10, 24)

_sequence = count(1)

# What the `api` fixture gives: api(user, today=EVENT_DAY) is a client.
Api = Callable[..., AsyncClient]


async def make_user(session: AsyncSession, role: Role, name: str = "Pessoa") -> User:
    number = next(_sequence)
    user = User(email=f"pessoa{number}@exemplo.com", name=name, role=role)
    session.add(user)
    await session.flush()
    return user


async def make_group(session: AsyncSession) -> tuple[Group, User]:
    """A group with its coordinator."""
    group = Group(name=f"Grupo Fictício {next(_sequence)}")
    session.add(group)
    coordinator = await make_user(session, Role.COORDINATOR, "Coordenadora Fictícia")
    await session.flush()
    session.add(GroupCoordinator(group_id=group.id, user_id=coordinator.id))
    await session.flush()
    return group, coordinator


async def make_action(
    session: AsyncSession, group: Group, starts_on: date = EVENT_DAY, **fields: object
) -> Action:
    values: dict[str, object] = {
        "group_id": group.id,
        "name": "Introdução à robótica",
        "type": ActionType.OFICINA,
        "starts_on": starts_on,
        "ends_on": starts_on,
        "format": ActionFormat.ONLINE,
        "visibility": ActionVisibility.CLOSED,
    }
    values.update(fields)
    action = Action(**values)
    session.add(action)
    await session.flush()
    return action


async def make_girl(
    session: AsyncSession,
    name: str | None = None,
    with_account: bool = False,
    study_stage: StudyStage | None = None,
) -> Girl:
    number = next(_sequence)
    user_id = None
    email = f"menina{number}@exemplo.com"
    if with_account:
        user = User(email=email, name=name or "Menina", role=Role.GIRL)
        session.add(user)
        await session.flush()
        user_id = user.id
    girl = Girl(
        email=email,
        name=name or f"Menina Fictícia {number:03d}",
        user_id=user_id,
        study_stage=study_stage,
    )
    session.add(girl)
    await session.flush()
    return girl


async def register(session: AsyncSession, action: Action, girl: Girl) -> Participation:
    participation = Participation(girl_id=girl.id, action_id=action.id)
    session.add(participation)
    await session.flush()
    return participation


def at(day: date, hour: int = 12) -> datetime:
    """A moment of `day` in UTC (12:00 UTC is 09:00 in Maceió)."""
    return datetime(day.year, day.month, day.day, hour, tzinfo=UTC)
