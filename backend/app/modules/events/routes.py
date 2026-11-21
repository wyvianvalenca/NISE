from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.catalog.utils import parse_item_id
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.events.schemas import EventOut
from app.modules.events.service import event_out, find_event
from app.modules.girls.service import get_girl_of_user
from app.modules.girls.utils import today_in_maceio

# Fica em /api/events, fora de /api/file, para não disputar o caminho com
# /api/file/{item_id}, que é o detalhe da atividade (A06·4a).
router = APIRouter(prefix="/events", tags=["File"])

RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {
        "description": 'Sem o aceite dos termos: {"error": "terms_not_accepted"}'
    },
    status.HTTP_404_NOT_FOUND: {
        "description": (
            'A conta não tem registro de menina: {"error": "profile_not_found"}.'
            " O item não é um evento do filé dela (sem escolha, no Ver depois,"
            ' no "Não é pra mim" ou uma atividade): {"error": "item_not_found"}'
        )
    },
}


def not_found(error: str) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"error": error})


# A06·4b · Evento (#178, RF-F10.13): o detalhe de um evento do filé dela, com o
# status (que decide os botões), as datas, o prazo e os dias que faltam,
# contados aqui no fuso de Maceió. Um evento cujas inscrições fecharam depois
# que ela o escolheu continua abrindo, porque continua no filé (RN-36).
#
# `item_id` é o id do catálogo, "curadoria-12" ou "acao-7". A menina é sempre a
# da sessão: a linha de outra menina nunca é achada, e responde 404 (RNF-G.03).
@router.get("/{item_id}", response_model=EventOut, responses=RESPONSES)
async def event_detail(
    item_id: str, user: AcceptedGirlDep, session: AsyncSessionDep
) -> EventOut | JSONResponse:
    girl = await get_girl_of_user(session, user.id)
    if girl is None:
        return not_found("profile_not_found")

    parsed = parse_item_id(item_id)
    if parsed is None:
        return not_found("item_not_found")

    event = await find_event(session, girl.id, *parsed)
    if event is None:
        return not_found("item_not_found")
    return event_out(event, today_in_maceio())
