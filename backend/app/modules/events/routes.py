from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.engine import AsyncSessionDep
from app.modules.catalog.utils import parse_item_id
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.events.schemas import EventOut
from app.modules.events.service import (
    FileEvent,
    event_out,
    find_event,
    mark_signed_up,
    undo_signed_up,
)
from app.modules.girls.service import get_girl_of_user
from app.modules.girls.utils import today_in_maceio
from app.users.models import User

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
    found = await event_of_session(session, user, item_id)
    if isinstance(found, JSONResponse):
        return found
    return event_out(found, today_in_maceio())


async def event_of_session(
    session: AsyncSession, user: User, item_id: str, for_update: bool = False
) -> FileEvent | JSONResponse:
    """O evento do filé da menina da sessão, ou a resposta 404 que a rota devolve.

    Com `for_update`, a linha fica travada: um clique duplo, ou "Desfazer" e
    "Tirar do filé" juntos, vão um depois do outro.
    """
    girl = await get_girl_of_user(session, user.id)
    if girl is None:
        return not_found("profile_not_found")

    parsed = parse_item_id(item_id)
    if parsed is None:
        return not_found("item_not_found")

    event = await find_event(session, girl.id, *parsed, for_update=for_update)
    if event is None:
        return not_found("item_not_found")
    return event


def conflict(error: str) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"error": error})


SIGN_UP_RESPONSES: dict[int | str, dict[str, Any]] = {
    **RESPONSES,
    status.HTTP_409_CONFLICT: {
        "description": (
            'O evento já foi concluído: {"error": "event_concluded"}. O'
            ' último dia do evento já passou: {"error": "event_over"}. Na'
            " marca, o evento de fora foi cancelado (desativado pela curadoria):"
            ' {"error": "event_cancelled"}'
        )
    },
}


# A09 · "Sim, me inscrevi" e A06·4b · "Já me inscrevi" (#182, RF-F10.14): o
# evento passa de próximo para "Inscrita". Marcar de novo dá o mesmo resultado,
# e o prazo não bloqueia (ela pode voltar do site depois do último dia). Um
# evento concluído ou que já acabou responde 409. Responde o detalhe já com o
# status novo.
#
# "Tirar do filé" não é aqui: é DELETE /api/file/{item_id} (#108), que vale para
# o evento próximo e para o inscrita. A menina é sempre a da sessão (RNF-G.03).
@router.put("/{item_id}/sign-up", response_model=EventOut, responses=SIGN_UP_RESPONSES)
async def sign_up(
    item_id: str, user: AcceptedGirlDep, session: AsyncSessionDep
) -> EventOut | JSONResponse:
    found = await event_of_session(session, user, item_id, for_update=True)
    if isinstance(found, JSONResponse):
        return found
    today = today_in_maceio()
    error = await mark_signed_up(session, found, today)
    if error is not None:
        return conflict(error)
    return event_out(found, today)


# "Desfazer" do aviso "Você tá inscrita!" (#182, RF-F10.15): o evento volta
# para próximo. Desfazer de novo dá o mesmo resultado; um evento concluído ou
# que já acabou responde 409. Responde o detalhe já com o status novo.
@router.delete(
    "/{item_id}/sign-up", response_model=EventOut, responses=SIGN_UP_RESPONSES
)
async def undo_sign_up(
    item_id: str, user: AcceptedGirlDep, session: AsyncSessionDep
) -> EventOut | JSONResponse:
    found = await event_of_session(session, user, item_id, for_update=True)
    if isinstance(found, JSONResponse):
        return found
    today = today_in_maceio()
    error = await undo_signed_up(session, found, today)
    if error is not None:
        return conflict(error)
    return event_out(found, today)
