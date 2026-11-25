from typing import Annotated

from fastapi import APIRouter, Query, status

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import CoordinatorGroupIdDep
from app.modules.actions.models import ActionType
from app.modules.actions.service import today_in_maceio
from app.modules.girls.models import Topic
from app.modules.results.future_self import future_self_by_participation
from app.modules.results.schemas import (
    AfterActionOut,
    ComparedOut,
    FutureSelfLineOut,
    FutureSelfOut,
    FutureSelfPointOut,
)
from app.modules.results.service import (
    Compared,
    Period,
    ResultsFilters,
    after_action,
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


# "Elas se veem na computação no futuro?" (#369, RF-F5.33): mesmos filtros e
# mesmo grupo do card acima, tirado da sessão.
@router.get(
    "/future-self",
    response_model=FutureSelfOut,
    responses={
        status.HTTP_403_FORBIDDEN: {"description": "Não é coordenadora ou sem grupo"},
        status.HTTP_409_CONFLICT: {"description": "Coordenadora em mais de um grupo"},
    },
)
async def future_self_route(
    group_id: CoordinatorGroupIdDep,
    session: AsyncSessionDep,
    period: Period = Period.LAST_12_MONTHS,
    action_id: Annotated[int | None, Query(ge=1)] = None,
    action_type: Annotated[ActionType | None, Query(alias="type")] = None,
    topic: Topic | None = None,
) -> FutureSelfOut:
    filters = ResultsFilters(
        period=period, action_id=action_id, type=action_type, topic=topic
    )
    lines = await future_self_by_participation(
        session, group_id, filters, today_in_maceio()
    )
    return FutureSelfOut(
        lines=[
            FutureSelfLineOut(
                group=line.group,
                girls=line.girls,
                points=[
                    FutureSelfPointOut(
                        milestone=point.milestone,
                        responses=point.responses,
                        sure=point.sure,
                    )
                    for point in line.points
                ],
            )
            for line in lines
        ]
    )
