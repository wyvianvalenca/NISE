from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.auth.permissions import GirlDep
from app.db.engine import AsyncSessionDep
from app.modules.consents.schemas import (
    GroupOrigin,
    SelfOrigin,
    TermsAcceptanceIn,
    TermsSummaryOut,
)
from app.modules.consents.service import (
    CURRENT_TERMS_VERSION,
    get_origin_group_name,
    record_terms_acceptance,
)

router = APIRouter(prefix="/terms", tags=["Terms"])


# Resumo dos termos da A04·1 (#53). A versão do grupo ou a da NISE depende de
# como ela chegou (RF-F7.04, RN-01, RN-04).
@router.get("/summary", response_model=TermsSummaryOut)
async def terms_summary(user: GirlDep, session: AsyncSessionDep) -> TermsSummaryOut:
    group_name = await get_origin_group_name(session, user.id)

    if group_name is None:
        origin: GroupOrigin | SelfOrigin = SelfOrigin()
    else:
        origin = GroupOrigin(group_name=group_name)

    return TermsSummaryOut(version=CURRENT_TERMS_VERSION, origin=origin)


# "Entendi, continuar" na A04·1 (RF-F7.02, RF-F7.05). Aceitar de novo a mesma
# versão responde 204 sem criar outro registro.
#
# De propósito, não há PUT, PATCH nem DELETE: o aceite não é editado nem
# apagado (RNF-F7.01). O trigger da migração garante isso também no banco.
@router.post(
    "/acceptance",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={
        status.HTTP_409_CONFLICT: {
            "description": 'Os termos mudaram: {"error": "terms_outdated"}'
        },
    },
)
async def accept_terms(
    data: TermsAcceptanceIn, user: GirlDep, session: AsyncSessionDep
) -> JSONResponse | None:
    accepted = await record_terms_acceptance(session, user.id, data.version)

    if not accepted:
        # Ela leu uma versão que já mudou: o front recarrega o resumo.
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"error": "terms_outdated"},
        )

    return None
