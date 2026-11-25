from typing import Annotated

from fastapi import APIRouter, Query, status

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import CoordinatorGroupIdDep
from app.modules.actions.models import ActionType
from app.modules.actions.service import today_in_maceio
from app.modules.girls.models import Topic
from app.modules.results.schemas import (
    AfterActionOut,
    ChangeOut,
    ComparedOut,
    InterestOut,
    MilestoneOut,
    MovementOut,
)
from app.modules.results.service import (
    Compared,
    Milestone,
    Period,
    ResultsFilters,
    after_action,
    interest,
)

router = APIRouter(prefix="/coordinator/results", tags=["Coordinator"])


# Resultados · "Logo depois da ação" (C5, #367, RF-F5.09, RF-F5.31). O grupo vem sempre
# da sessão da coordenadora, nunca da requisição (RNF-F5.01, RNF-G.03): uma
# `action_id` de outro grupo só não encontra nada, e o card mostra zero.
@router.get(
    "/after-action",
    response_model=AfterActionOut,
    responses={
        status.HTTP_403_FORBIDDEN: {"description": "Não é coordenadora ou sem grupo"},
        status.HTTP_409_CONFLICT: {"description": "Coordenadora em mais de um grupo"},
    },
)
async def after_action_route(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    period: Period = Period.LAST_12_MONTHS,
    action_id: Annotated[int | None, Query(ge=1)] = None,
    action_type: Annotated[ActionType | None, Query(alias="type")] = None,
    topic: Topic | None = None,
) -> AfterActionOut:
    filters = ResultsFilters(
        period=period, action_id=action_id, type=action_type, topic=topic
    )
    numbers = await after_action(session, group_id, filters, today_in_maceio())

    def compared(counts: Compared) -> ComparedOut:
        return ComparedOut(participants=counts.participants, no_shows=counts.no_shows)

    return AfterActionOut(
        participants=numbers.participants,
        no_shows=numbers.no_shows,
        returned=compared(numbers.returned),
        started_file=compared(numbers.started_file),
        concluded_file=compared(numbers.concluded_file),
    )


# Resultados · "Como o interesse evolui" e "Quem mudou de situação" (C5, #368,
# RF-F5.04, RF-F5.32). Mesmos filtros e mesmo grupo da sessão da rota acima.
@router.get(
    "/interest",
    response_model=InterestOut,
    responses={
        status.HTTP_403_FORBIDDEN: {"description": "Não é coordenadora ou sem grupo"},
        status.HTTP_409_CONFLICT: {"description": "Coordenadora em mais de um grupo"},
    },
)
async def interest_route(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    period: Period = Period.LAST_12_MONTHS,
    action_id: Annotated[int | None, Query(ge=1)] = None,
    action_type: Annotated[ActionType | None, Query(alias="type")] = None,
    topic: Topic | None = None,
) -> InterestOut:
    filters = ResultsFilters(
        period=period, action_id=action_id, type=action_type, topic=topic
    )
    numbers = await interest(session, group_id, filters, today_in_maceio())

    def milestone(counts: Milestone) -> MilestoneOut:
        return MilestoneOut(answered=counts.answered, counts=counts.counts)

    movement = numbers.movement
    return InterestOut(
        signup=milestone(numbers.signup),
        rounds={rnd: milestone(m) for rnd, m in numbers.rounds.items()},
        movement=MovementOut(
            with_both=movement.with_both,
            went_up=movement.went_up,
            stayed=movement.stayed,
            went_down=movement.went_down,
            common_changes=[
                ChangeOut(origin=c.origin, destination=c.destination, girls=c.girls)
                for c in movement.common_changes
            ],
        ),
    )
