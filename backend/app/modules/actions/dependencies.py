from datetime import date
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.auth.permissions import CoordinatorDep
from app.db.engine import AsyncSessionDep
from app.modules.actions.models import Action
from app.modules.actions.service import today_in_maceio
from app.modules.groups.models import GroupCoordinator


async def get_coordinator_group_ids(
    user: CoordinatorDep, session: AsyncSessionDep
) -> list[int]:
    """The groups the signed-in coordinator belongs to, from `GroupCoordinator`.

    Every action route takes the groups from here and never from the request
    (RN-14, RNF-G.03). A coordinator with no group cannot act on anything (403).
    """
    group_ids = list(
        (
            await session.scalars(
                select(GroupCoordinator.group_id).where(
                    GroupCoordinator.user_id == user.id
                )
            )
        ).all()
    )

    if not group_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem grupo")

    return group_ids


CoordinatorGroupIdsDep = Annotated[list[int], Depends(get_coordinator_group_ids)]


async def get_coordinator_group_id(group_ids: CoordinatorGroupIdsDep) -> int:
    """The one group of a coordinator, for routes with no action to read it from.

    Creating and listing have no action, and the request carries no group. With
    several groups, nothing here says which one she means, and picking for her
    could change another group's data, so the answer is 409 until a story lets
    her choose.
    """
    if len(group_ids) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Coordenadora em mais de um grupo",
        )

    return group_ids[0]


CoordinatorGroupIdDep = Annotated[int, Depends(get_coordinator_group_id)]


async def get_group_action(
    action_id: int, group_ids: CoordinatorGroupIdsDep, session: AsyncSessionDep
) -> Action:
    """The action with this id, looked up already filtered by her groups.

    The group comes from the action itself and is checked against every group
    the coordinator belongs to, so it works for each of her groups. An action of
    any other group answers 404, the same as one that does not exist, so the
    response does not reveal that it exists (RNF-G.03).
    """
    action = await session.scalar(
        select(Action)
        .where(Action.id == action_id, Action.group_id.in_(group_ids))
        .options(selectinload(Action.audiences), selectinload(Action.topics))
    )

    if action is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ação não encontrada"
        )

    return action


GroupActionDep = Annotated[Action, Depends(get_group_action)]


def get_today() -> date:
    """Today in Maceió. A dependency so tests can set the date."""
    return today_in_maceio()


TodayDep = Annotated[date, Depends(get_today)]
