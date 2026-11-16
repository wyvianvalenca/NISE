from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.engine import AsyncSessionDep
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.girls.schemas import InterestOptionsOut, InterestsIn, OptionOut
from app.modules.girls.service import save_interests
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS

router = APIRouter(prefix="/profile", tags=["Profile"])

TERMS_NOT_ACCEPTED: dict[int | str, dict[str, Any]] = {
    status.HTTP_403_FORBIDDEN: {
        "description": 'Sem o aceite dos termos: {"error": "terms_not_accepted"}'
    },
}


# Listas da A05 · "O que te interessa?" (#56, RF-F10.01). Vêm do back para o
# front e as sugestões usarem os mesmos códigos.
#
# AcceptedGirlDep porque a A05 vem depois dos termos. As listas não têm dado
# pessoal, mas só quem está no cadastro precisa delas.
@router.get(
    "/interest-options",
    response_model=InterestOptionsOut,
    responses=TERMS_NOT_ACCEPTED,
)
async def interest_options(user: AcceptedGirlDep) -> InterestOptionsOut:
    return InterestOptionsOut(
        topics=[
            OptionOut(code=topic.value, label=label)
            for topic, label in TOPIC_LABELS.items()
        ],
        stages=[
            OptionOut(code=stage.value, label=label)
            for stage, label in STUDY_STAGE_LABELS.items()
        ],
    )


# "Começar meu filé" na A05 (RF-F10.01). Escolher de novo troca o que estava
# gravado. Códigos fora das listas, "me mostra de tudo" junto com temas e
# escolha sem tema nenhum respondem 422 (D-19: não há "Pular por agora").
#
# Não há id na URL nem no corpo: ela só muda o próprio perfil, o da sessão
# (RNF-G.03).
@router.put(
    "/interests",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={
        **TERMS_NOT_ACCEPTED,
        status.HTTP_404_NOT_FOUND: {
            "description": (
                'A conta não tem registro de menina: {"error": "profile_not_found"}'
            )
        },
    },
)
async def update_interests(
    data: InterestsIn, user: AcceptedGirlDep, session: AsyncSessionDep
) -> JSONResponse | None:
    saved = await save_interests(session, user.id, data)

    if not saved:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "profile_not_found"},
        )

    return None
