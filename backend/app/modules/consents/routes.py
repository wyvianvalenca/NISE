from fastapi import APIRouter

from app.auth.permissions import GirlDep
from app.db.engine import AsyncSessionDep
from app.modules.consents.schemas import GroupOrigin, SelfOrigin, TermsSummaryOut
from app.modules.consents.service import CURRENT_TERMS_VERSION, get_origin_group_name

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
