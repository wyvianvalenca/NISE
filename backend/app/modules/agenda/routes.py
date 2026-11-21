from fastapi import APIRouter

from app.db.engine import AsyncSessionDep
from app.modules.admissions.dependencies import CurrentGirlDep
from app.modules.admissions.service import girl_has_open_match
from app.modules.agenda.schemas import ToAnswerOut

# "Sua agenda" (A14) da menina. A agenda inteira é da M5 (#129); aqui está só o
# que a M7 precisa. Coordenadora e curadoria levam 403 (CurrentGirlDep).
router = APIRouter(prefix="/agenda", tags=["Agenda"])


@router.get("/to-answer", response_model=ToAnswerOut)
async def to_answer(session: AsyncSessionDep, girl: CurrentGirlDep) -> ToAnswerOut:
    """O que ela tem pra responder, para a agenda e a faixa do filé (RF-F31.10)."""
    return ToAnswerOut(list_match=await girl_has_open_match(session, girl.id))
