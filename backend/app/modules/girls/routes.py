from typing import Any

from fastapi import APIRouter, status

from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.girls.schemas import InterestOptionsOut, OptionOut
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
