from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.girls.utils import today_in_maceio
from app.modules.suggestions.schemas import DiscoverOut, LastBandIn
from app.modules.suggestions.service import load_discover, save_last_band

router = APIRouter(prefix="/discover", tags=["Discover"])

RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {
        "description": 'Sem o aceite dos termos: {"error": "terms_not_accepted"}'
    },
    status.HTTP_404_NOT_FOUND: {
        "description": (
            'A conta não tem registro de menina: {"error": "profile_not_found"}'
        )
    },
}


def profile_not_found() -> JSONResponse:
    # Não deveria acontecer: o cadastro (#51, #52) sempre cria ou liga um registro.
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND, content={"error": "profile_not_found"}
    )


# A06·1 · Descobrir: "Quanto você quer mergulhar agora?" (#86, RF-F10.03).
# As 5 faixas, sempre na ordem da tela, com quantas sugestões cada uma tem
# (0 quando não tem nenhuma), e a faixa aberta da última vez.
#
# Não há id na URL: ela só vê as próprias contagens, as da sessão (RNF-G.03).
@router.get("", response_model=DiscoverOut, responses=RESPONSES)
async def discover(
    user: AcceptedGirlDep, session: AsyncSessionDep
) -> DiscoverOut | JSONResponse:
    data = await load_discover(session, user.id, today_in_maceio())

    if data is None:
        return profile_not_found()

    return data


# O toque numa faixa do Descobrir. Grava a faixa para a tag "da última vez"
# na próxima visita. Uma faixa fora das 5 responde 422.
#
# A menina é sempre a da sessão (RNF-G.03).
@router.put(
    "/last-band",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses=RESPONSES,
)
async def update_last_band(
    data: LastBandIn, user: AcceptedGirlDep, session: AsyncSessionDep
) -> JSONResponse | None:
    saved = await save_last_band(session, user.id, data.band)

    if not saved:
        return profile_not_found()

    return None
