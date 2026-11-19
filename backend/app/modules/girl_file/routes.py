from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.catalog.service import is_suggestible
from app.modules.catalog.utils import parse_item_id
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.girl_file.schemas import ChoiceIn, ChoiceOut
from app.modules.girl_file.service import file_total, save_choice
from app.modules.girls.service import get_girl_of_user
from app.modules.girls.utils import today_in_maceio

router = APIRouter(prefix="/file", tags=["File"])

RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {
        "description": 'Sem o aceite dos termos: {"error": "terms_not_accepted"}'
    },
    status.HTTP_404_NOT_FOUND: {
        "description": (
            'A conta não tem registro de menina: {"error": "profile_not_found"}.'
            " O item não existe ou ela não poderia vê-lo nas sugestões:"
            ' {"error": "item_not_found"}'
        )
    },
}


def not_found(error: str) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"error": error})


# A06·2 · Os três botões de uma sugestão (#102, RF-F10.04): "Quero fazer" põe o
# item no filé, "Talvez depois" no "Ver depois" e "Não é pra mim" o tira das
# sugestões, com o motivo opcional da A06·2a. Responde o novo total do filé,
# para a pílula "Meu filé".
#
# `item_id` é o id do catálogo, "curadoria-12" ou "acao-7". Escolher de novo no
# mesmo item troca a escolha anterior. A menina é sempre a da sessão: não há id
# dela na URL nem no corpo (RNF-G.03).
@router.put("/{item_id}", response_model=ChoiceOut, responses=RESPONSES)
async def choose(
    item_id: str, data: ChoiceIn, user: AcceptedGirlDep, session: AsyncSessionDep
) -> ChoiceOut | JSONResponse:
    girl = await get_girl_of_user(session, user.id)
    if girl is None:
        # Não deveria acontecer: o cadastro (#51, #52) sempre cria ou liga um registro.
        return not_found("profile_not_found")

    parsed = parse_item_id(item_id)
    if parsed is None:
        return not_found("item_not_found")
    origin, number = parsed
    if not await is_suggestible(
        session, origin, number, girl.city_ibge_code, today_in_maceio()
    ):
        return not_found("item_not_found")

    await save_choice(session, girl.id, origin, number, data.choice, data.reason)
    return ChoiceOut(file_total=await file_total(session, girl.id))
