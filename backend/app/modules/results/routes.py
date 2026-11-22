from typing import Annotated

from fastapi import APIRouter, Query, status

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import CoordinatorGroupIdDep
from app.modules.actions.models import ActionType
from app.modules.actions.service import today_in_maceio
from app.modules.girls.models import Topic
from app.modules.results.schemas import AfterActionOut, ComparedOut
from app.modules.results.service import Period, ResultsFilters, after_action

router = APIRouter(prefix="/coordinator/results", tags=["Coordinator"])


# Resultados · "Logo depois da ação" (C5, #367, RF-F5.09). O grupo vem sempre
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

    return AfterActionOut(
        participants=numbers.participants,
        no_shows=numbers.no_shows,
        returned=ComparedOut(
            participants=numbers.returned_participants,
            no_shows=numbers.returned_no_shows,
        ),
    )
