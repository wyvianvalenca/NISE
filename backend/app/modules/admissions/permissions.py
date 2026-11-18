from sqlalchemy import CompoundSelect, exists, select, union
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.girls.models import Girl
from app.modules.groups.models import GroupCoordinator


async def coordinates_a_group_of_girl(
    session: AsyncSession, coordinator_id: int, girl_id: int
) -> bool:
    """A coordenadora é de um grupo da menina? (RNF-G.03)

    Os grupos da menina são o do convite (`origin_group_id`) e os das ações de
    que ela participou. É a "coordenação dos grupos de que você participou" que
    a A19 cita.
    """
    girl_groups: CompoundSelect[tuple[int | None]] = union(
        select(Girl.origin_group_id).where(Girl.id == girl_id),
        select(Action.group_id)
        .join(Participation, Participation.action_id == Action.id)
        .where(Participation.girl_id == girl_id),
    )
    statement = select(
        exists().where(
            GroupCoordinator.user_id == coordinator_id,
            GroupCoordinator.group_id.in_(girl_groups.scalar_subquery()),
        )
    )

    return bool(await session.scalar(statement))
