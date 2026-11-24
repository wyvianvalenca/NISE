from typing import Annotated

from fastapi import APIRouter, Query, status

from app.auth.permissions import NiseTeamDep
from app.db.engine import AsyncSessionDep
from app.modules.admin.schemas import CoordinatorFilter, CoordinatorListOut
from app.modules.admin.service import list_coordinators

router = APIRouter(prefix="/admin", tags=["Admin"])


# AD02 Coordenadoras · a lista (#447, RF-S2.24). Só a equipe NISE entra
# (RNF-G.03): coordenadora e menina recebem 403, e sem sessão, 401. A página
# não mostra nada de meninas (RN-41).
@router.get(
    "/coordinators",
    response_model=CoordinatorListOut,
    responses={status.HTTP_403_FORBIDDEN: {"description": "Não é da equipe NISE"}},
)
async def coordinators(
    _team: NiseTeamDep,
    session: AsyncSessionDep,
    status_filter: Annotated[CoordinatorFilter, Query(alias="filter")] = (
        CoordinatorFilter.ALL
    ),
    q: Annotated[str, Query(max_length=100)] = "",
) -> CoordinatorListOut:
    return await list_coordinators(session, status_filter, q)
