from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.catalog.models import CuratedItem
from app.modules.catalog.service import from_curated, is_suggestible
from app.modules.catalog.utils import parse_item_id
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.girl_file.models import FileEntry
from app.modules.girl_file.schemas import (
    ActivityOut,
    ChoiceIn,
    ChoiceOut,
    FileOut,
    LaterOut,
    StatusIn,
)
from app.modules.girl_file.service import (
    activity_out,
    advance_status,
    file_total,
    find_activity,
    load_file,
    load_later,
    remove_choice,
    save_choice,
)
from app.modules.girls.models import EffortBand, Girl
from app.modules.girls.service import get_girl_of_user
from app.modules.girls.utils import today_in_maceio
from app.modules.suggestions.service import (
    get_girl_with_topics,
    profile_of,
    why_for_you,
)

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


# A06·3 · Seu filé (#114, RF-F10.07): as seções "Em andamento", "Próximas
# aventuras" e "Concluídos", com o contador e os itens de cada uma, e os
# quadradinhos do desenho, pelo tema e pela seção. Só lê o status; quem muda
# são os botões das outras telas (tabela de status da #78).
#
# Sem porcentagem nem comparação com outras meninas (RN-28). Não há id na URL:
# ela só vê o próprio filé, o da sessão (RNF-G.03).
@router.get(
    "",
    response_model=FileOut,
    responses={
        status.HTTP_403_FORBIDDEN: RESPONSES[status.HTTP_403_FORBIDDEN],
        status.HTTP_404_NOT_FOUND: {
            "description": (
                'A conta não tem registro de menina: {"error": "profile_not_found"}'
            )
        },
    },
)
async def my_file(
    user: AcceptedGirlDep, session: AsyncSessionDep
) -> FileOut | JSONResponse:
    data = await load_file(session, user.id)

    if data is None:
        # Não deveria acontecer: o cadastro (#51, #52) sempre cria ou liga um registro.
        return not_found("profile_not_found")

    return data


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


UNDO_RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: RESPONSES[status.HTTP_403_FORBIDDEN],
    status.HTTP_404_NOT_FOUND: {
        "description": (
            'A conta não tem registro de menina: {"error": "profile_not_found"}.'
            ' O id não é de um item do catálogo: {"error": "item_not_found"}'
        )
    },
    status.HTTP_409_CONFLICT: {
        "description": (
            "Uma atividade concluída não sai do filé:"
            ' {"error": "concluded_cannot_be_removed"}'
        )
    },
}


# A06·2 · "Desfazer" (#106, RF-F10.05): apaga a escolha dela sobre um item, com
# o motivo do "Não é pra mim", e o item volta a poder ser sugerido. Responde o
# novo total do filé, para a pílula "Meu filé". É também o "Remover" do Ver
# depois e o "Tirar do filé" de uma atividade próxima ou em andamento (#119).
#
# Não confere se o item ainda aparece nas sugestões: uma ação que fechou entre a
# escolha e o "Desfazer" também precisa ser desfeita. Um item sem escolha dela
# responde 200 sem mudar nada, então chamar duas vezes dá o mesmo resultado.
# Uma atividade concluída não sai do filé: responde 409 (tabela de status da #78).
# A menina é sempre a da sessão; a linha de outra menina nunca é achada (RNF-G.03).
@router.delete("/{item_id}", response_model=ChoiceOut, responses=UNDO_RESPONSES)
async def undo_choice(
    item_id: str, user: AcceptedGirlDep, session: AsyncSessionDep
) -> ChoiceOut | JSONResponse:
    girl = await get_girl_of_user(session, user.id)
    if girl is None:
        return not_found("profile_not_found")

    parsed = parse_item_id(item_id)
    if parsed is None:
        return not_found("item_not_found")
    origin, number = parsed

    if not await remove_choice(session, girl.id, origin, number):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"error": "concluded_cannot_be_removed"},
        )
    return ChoiceOut(file_total=await file_total(session, girl.id))


ACTIVITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: RESPONSES[status.HTTP_403_FORBIDDEN],
    status.HTTP_404_NOT_FOUND: {
        "description": (
            'A conta não tem registro de menina: {"error": "profile_not_found"}.'
            " O item não é uma atividade do filé dela (sem escolha, no Ver"
            ' depois, no "Não é pra mim" ou um evento): {"error": "item_not_found"}'
        )
    },
}


def activity_of(entry: FileEntry, item: CuratedItem, girl: Girl) -> ActivityOut:
    """O detalhe, com o "Por que pra você" pelas mesmas regras das sugestões.

    A menina precisa de topics carregados (get_girl_with_topics).
    """
    profile = profile_of(girl, today_in_maceio())
    why = why_for_you(from_curated(item), profile)
    return activity_out(entry, item, why, girl.name)


# A06·4a · Atividade (#119, RF-F10.08, RF-F11.04): o detalhe de uma atividade
# do filé dela, com a seção em que está (que decide os botões) e o "Por que pra
# você". Um item que saiu das sugestões (vencido, desativado) continua abrindo,
# porque continua no filé.
#
# `item_id` é o id do catálogo, "curadoria-12". A menina é sempre a da sessão: a
# linha de outra menina nunca é achada, e responde 404 (RNF-G.03).
@router.get("/{item_id}", response_model=ActivityOut, responses=ACTIVITY_RESPONSES)
async def activity_detail(
    item_id: str, user: AcceptedGirlDep, session: AsyncSessionDep
) -> ActivityOut | JSONResponse:
    girl = await get_girl_with_topics(session, user.id)
    if girl is None:
        return not_found("profile_not_found")

    found = await find_activity(session, girl.id, item_id)
    if found is None:
        return not_found("item_not_found")
    entry, item = found

    return activity_of(entry, item, girl)


# A06·4a · "Marcar como iniciada" e "Marcar como concluída" (#119). A atividade
# anda uma seção por vez: da próxima para em andamento, e de em andamento para
# concluída, que guarda o dia. Outro salto responde 409. Responde o detalhe já
# com a seção nova, para a tela trocar o selo e os botões.
#
# A menina é sempre a da sessão: ela só muda o próprio filé (RNF-G.03).
@router.put(
    "/{item_id}/status",
    response_model=ActivityOut,
    responses={
        **ACTIVITY_RESPONSES,
        status.HTTP_409_CONFLICT: {
            "description": (
                "Não é o próximo passo da atividade (ex.: da próxima direto para"
                ' concluída): {"error": "invalid_status_change"}'
            )
        },
    },
)
async def change_status(
    item_id: str, data: StatusIn, user: AcceptedGirlDep, session: AsyncSessionDep
) -> ActivityOut | JSONResponse:
    girl = await get_girl_with_topics(session, user.id)
    if girl is None:
        return not_found("profile_not_found")

    found = await find_activity(session, girl.id, item_id)
    if found is None:
        return not_found("item_not_found")
    entry, item = found

    if not await advance_status(session, entry, data.status, today_in_maceio()):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"error": "invalid_status_change"},
        )
    return activity_of(entry, item, girl)


# O Ver depois fica em /api/later, fora de /api/file, para não disputar o
# caminho com /api/file/{item_id}.
later_router = APIRouter(prefix="/later", tags=["File"])


# A06·2b · Ver depois (#110, RF-F10.06): o que ela guardou com "Talvez depois",
# do mais recente para o mais antigo, com o que o cartão mostra. `band` é o
# filtro por faixa; uma faixa fora das 5 responde 422. Um item vencido não
# aparece (RF-F11.07).
#
# Só lê: "+ Quero fazer" usa PUT /api/file/{id} (#104), que troca o "Talvez
# depois" por "Quero fazer", e "Remover" usa DELETE /api/file/{id} (#108), que
# apaga a escolha e deixa o item ser sugerido de novo. Não há id da menina na
# URL: ela só vê a própria lista, a da sessão (RNF-G.03).
@later_router.get(
    "",
    response_model=LaterOut,
    responses={
        status.HTTP_403_FORBIDDEN: RESPONSES[status.HTTP_403_FORBIDDEN],
        status.HTTP_404_NOT_FOUND: {
            "description": (
                'A conta não tem registro de menina: {"error": "profile_not_found"}'
            )
        },
    },
)
async def my_later(
    user: AcceptedGirlDep, session: AsyncSessionDep, band: EffortBand | None = None
) -> LaterOut | JSONResponse:
    data = await load_later(session, user.id, today_in_maceio(), band)

    if data is None:
        # Não deveria acontecer: o cadastro (#51, #52) sempre cria ou liga um registro.
        return not_found("profile_not_found")

    return data
