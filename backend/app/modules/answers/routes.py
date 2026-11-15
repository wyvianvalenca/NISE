from typing import Any

from fastapi import APIRouter, status

from app.db.engine import AsyncSessionDep
from app.modules.answers.schemas import PendingRatingOut
from app.modules.answers.service import get_pending_rating
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
