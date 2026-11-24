from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.followup.schemas import (
    CurrentFollowupOut,
    FollowupIn,
    FollowupOptionsOut,
)
from app.modules.followup.service import (
    FollowupResult,
    get_current_followup,
    record_followup,
)
from app.modules.followup.utils import (
    ACTIVITY_LABELS,
    COMPUTING_VIEW_LABELS,
    COURSE_LABELS,
    COURSE_STATUS_LABELS,
    FUTURE_SELF_LABELS,
    HELP_WANTED_LABELS,
    STILL_ENROLLED_LABELS,
)
from app.modules.girls.schemas import OptionOut

router = APIRouter(prefix="/followup", tags=["Followup"])

TERMS_NOT_ACCEPTED: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {
        "description": 'Sem o aceite dos termos: {"error": "terms_not_accepted"}'
    },
}


# A18 · "Como está seu caminho?" (#293). Responde a rodada aberta hoje, com
# `answered` quando ela já respondeu, ou null quando não há rodada aberta.
#
# Não há id na URL: ela só vê o próprio questionário, o da sessão (D-61,
# RNF-G.03).
@router.get(
    "/current",
    response_model=CurrentFollowupOut | None,
    responses=TERMS_NOT_ACCEPTED,
)
async def current_followup(
    user: AcceptedGirlDep, session: AsyncSessionDep
) -> CurrentFollowupOut | None:
    return await get_current_followup(session, user.id)


# As opções das perguntas fechadas, para a tela não repetir os textos.
@router.get(
    "/options",
    response_model=FollowupOptionsOut,
    responses=TERMS_NOT_ACCEPTED,
)
async def followup_options(user: AcceptedGirlDep) -> FollowupOptionsOut:
    return FollowupOptionsOut(
        computing_views=[
            OptionOut(code=option.value, label=label)
            for option, label in COMPUTING_VIEW_LABELS.items()
        ],
        future_selves=[
            OptionOut(code=option.value, label=label)
            for option, label in FUTURE_SELF_LABELS.items()
        ],
        activities=[
            OptionOut(code=option.value, label=label)
            for option, label in ACTIVITY_LABELS.items()
        ],
        helps=[
            OptionOut(code=option.value, label=label)
            for option, label in HELP_WANTED_LABELS.items()
        ],
        course_statuses=[
            OptionOut(code=option.value, label=label)
            for option, label in COURSE_STATUS_LABELS.items()
        ],
        courses=[
            OptionOut(code=option.value, label=label)
            for option, label in COURSE_LABELS.items()
        ],
        still_enrolled=[
            OptionOut(code=option.value, label=label)
            for option, label in STILL_ENROLLED_LABELS.items()
        ],
    )


# "Enviar respostas" na A18 (RF-F4.07). "Agora não" não chama nada: a rodada
# continua pendente até fechar (RN-39).
@router.post(
    "/answers",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={
        **TERMS_NOT_ACCEPTED,
        status.HTTP_404_NOT_FOUND: {
            "description": (
                'Nenhuma rodada aberta, ou a rodada já fechou: {"error": "no_open_round"}'
            )
        },
        status.HTTP_409_CONFLICT: {
            "description": 'Ela já respondeu essa rodada: {"error": "already_answered"}'
        },
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": (
                "Resposta inválida. Também quando a pergunta 3 enviada não é a que "
                'ela vê (tem curso registrado ou não): {"error": "invalid_course_answer"}'
            )
        },
    },
)
async def answer_followup(
    data: FollowupIn, user: AcceptedGirlDep, session: AsyncSessionDep
) -> JSONResponse | None:
    result = await record_followup(session, user.id, data)

    if result is FollowupResult.NO_OPEN_ROUND:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "no_open_round"},
        )

    if result is FollowupResult.INVALID_COURSE_ANSWER:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"error": "invalid_course_answer"},
        )

    if result is FollowupResult.ALREADY_ANSWERED:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"error": "already_answered"},
        )

    return None
