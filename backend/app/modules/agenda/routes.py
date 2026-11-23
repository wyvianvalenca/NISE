from fastapi import APIRouter

from app.db.engine import AsyncSessionDep
from app.modules.admissions.dependencies import CurrentGirlDep
from app.modules.admissions.service import girl_has_open_match
from app.modules.agenda.schemas import (
    AgendaDatesOut,
    OpenFollowupOut,
    ToAnswerOut,
)
from app.modules.agenda.service import list_upcoming
from app.modules.answers.service import list_pending_ratings
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.followup.service import get_current_followup
from app.modules.girls.utils import today_in_maceio

# "Sua agenda" (A14) da menina. Coordenadora e curadoria levam 403 (CurrentGirlDep).
router = APIRouter(prefix="/agenda", tags=["Agenda"])


@router.get("/to-answer", response_model=ToAnswerOut)
async def to_answer(
    session: AsyncSessionDep, girl: CurrentGirlDep, user: AcceptedGirlDep
) -> ToAnswerOut:
    """O que ela tem pra responder, para a agenda e a faixa do filé (RF-F31.10, RF-F4.06)."""
    current = await get_current_followup(session, user.id)
    # Rodada já respondida sai de "Pra responder" (RN-39).
    open_followup = (
        OpenFollowupOut(round=current.round, last_day=current.last_day)
        if current is not None and not current.answered
        else None
    )

    return ToAnswerOut(
        list_match=await girl_has_open_match(session, girl.id),
        ratings=await list_pending_ratings(session, user.id),
        followup=open_followup,
    )


@router.get("/dates", response_model=AgendaDatesOut)
async def dates(session: AsyncSessionDep, user: AcceptedGirlDep) -> AgendaDatesOut:
    """As datas e os questionários que ainda vão chegar (RF-F4.11b)."""
    return AgendaDatesOut(
        upcoming=await list_upcoming(session, user.id, today_in_maceio())
    )
