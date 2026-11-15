from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.answers.schemas import PendingRatingOut, RatingIn
from app.modules.answers.service import RatingResult, get_pending_rating, record_rating
from app.modules.consents.permissions import AcceptedGirlDep

router = APIRouter(prefix="/ratings", tags=["Ratings"])

TERMS_NOT_ACCEPTED: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {
        "description": 'Sem o aceite dos termos: {"error": "terms_not_accepted"}'
    },
}


# A03 · "E aí, curtiu a oficina?" (#58). Responde a ação para avaliar ou null,
# quando não há nada: no M2 ela não tem participação, e o front pula a tela.
#
# Não há id na URL: ela só vê as próprias participações, as da sessão
# (RNF-G.03). AcceptedGirlDep porque a A03 vem depois dos termos.
@router.get(
    "/pending",
    response_model=PendingRatingOut | None,
    responses=TERMS_NOT_ACCEPTED,
)
async def pending_rating(
    user: AcceptedGirlDep, session: AsyncSessionDep
) -> PendingRatingOut | None:
    return await get_pending_rating(session, user.id)


# "Enviar avaliação" na A03 (RF-F4.03a, RF-F4.07). "Agora não" não chama
# nada: a avaliação continua pendente para o link do e-mail (RF-F4.03b).
#
# A ação vem no corpo, mas a menina é sempre a da sessão: ela só avalia ação em
# que tem participação com presença (RNF-G.03).
@router.post(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={
        **TERMS_NOT_ACCEPTED,
        status.HTTP_404_NOT_FOUND: {
            "description": (
                'Sem participação com presença nessa ação: {"error": "nothing_to_rate"}'
            )
        },
        status.HTTP_409_CONFLICT: {
            "description": 'Ela já avaliou essa ação: {"error": "already_rated"}'
        },
    },
)
async def rate_action(
    data: RatingIn, user: AcceptedGirlDep, session: AsyncSessionDep
) -> JSONResponse | None:
    result = await record_rating(
        session, user.id, data.action_id, data.score, data.comment
    )

    if result is RatingResult.NOTHING_TO_RATE:
        # 404, e não 403: não conta se a ação existe para quem não foi a ela.
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "nothing_to_rate"},
        )

    if result is RatingResult.ALREADY_RATED:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"error": "already_rated"},
        )

    return None
