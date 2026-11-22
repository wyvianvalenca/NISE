from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from app.db.engine import AsyncSessionDep
from app.modules.actions.dependencies import GroupActionDep
from app.modules.registrations.schemas import RegistrationListOut, RegistrationOut
from app.modules.registrations.service import list_registrations, registration_columns

router = APIRouter(prefix="/actions/{action_id}/registrations", tags=["Registrations"])

NOT_FOUND: dict[int | str, dict[str, Any]] = {
    status.HTTP_404_NOT_FOUND: {"description": "Ação não encontrada"}
}


# The card "Inscritas" of the action page (K11, #233, RF-F1.14). An action of
# another group is a 404 (RNF-G.03, RN-01). `columns` ignores search and paging.
@router.get("", response_model=RegistrationListOut, responses=NOT_FOUND)
async def list_registrations_route(
    action: GroupActionDep,
    session: AsyncSessionDep,
    search: Annotated[str | None, Query(max_length=100)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> RegistrationListOut:
    rows, total = await list_registrations(session, action, search, offset, limit)

    return RegistrationListOut(
        items=[
            RegistrationOut(
                id=participation.id,
                name=name,
                email=email,
                whatsapp=participation.whatsapp,
                study_stage=participation.study_stage,
                school_year=participation.school_year,
            )
            for participation, name, email in rows
        ],
        total=total,
        columns=await registration_columns(session, action),
    )
