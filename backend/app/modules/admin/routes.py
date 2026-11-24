import asyncio
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.auth.permissions import NiseTeamDep
from app.db.engine import AsyncSessionDep
from app.modules.admin.schemas import (
    CoordinatorFilter,
    CoordinatorInviteIn,
    CoordinatorInviteOut,
    CoordinatorListOut,
    GroupOut,
)
from app.modules.admin.service import list_coordinators
from app.modules.groups.coordinator_email import (
    first_name,
    send_coordinator_invite_email,
)
from app.modules.groups.coordinator_invites import (
    create_coordinator_invite,
    list_groups,
)

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


# AD03 Convidar coordenadora · os grupos que a equipe pode escolher (#453).
@router.get(
    "/groups",
    response_model=list[GroupOut],
    responses={status.HTTP_403_FORBIDDEN: {"description": "Não é da equipe NISE"}},
)
async def groups(_team: NiseTeamDep, session: AsyncSessionDep) -> list[GroupOut]:
    return [
        GroupOut(
            id=group.id,
            name=group.name,
            city=f"{group.city.name}, {group.city.state}" if group.city else None,
        )
        for group in await list_groups(session)
    ]


# AD03/AD04 Convidar coordenadora (#453, RF-S2.20, RF-S2.31, RN-35). Só a
# equipe NISE convida (RNF-G.03). Erros, em {"error": ...}: 409
# email_has_account, invite_pending e group_exists; 404 group_not_found; 422
# invalid_city. Nada é criado nem enviado nesses casos.
@router.post(
    "/coordinators/invites",
    response_model=CoordinatorInviteOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_403_FORBIDDEN: {"description": "Não é da equipe NISE"},
        status.HTTP_404_NOT_FOUND: {"description": "group_not_found"},
        status.HTTP_409_CONFLICT: {
            "description": "email_has_account, invite_pending ou group_exists"
        },
    },
)
async def invite_coordinator(
    data: CoordinatorInviteIn, _team: NiseTeamDep, session: AsyncSessionDep
) -> CoordinatorInviteOut:
    created = await create_coordinator_invite(
        session,
        name=data.name,
        email=data.email,
        group_id=data.group_id,
        new_group_name=data.new_group.name if data.new_group else None,
        new_group_city_id=data.new_group.city_id if data.new_group else None,
    )
    invite = created.invite
    # O smtplib é síncrono: numa thread, para não travar o servidor. O convite
    # já está gravado: se o e-mail não sai, ele fica na lista.
    email_sent = await asyncio.to_thread(
        send_coordinator_invite_email,
        invite.email,
        invite.name,
        created.group.name,
        created.token,
        invite.expires_at,
    )
    return CoordinatorInviteOut(
        first_name=first_name(invite.name),
        email=invite.email,
        group_name=created.group.name,
        expires_at=invite.expires_at,
        email_sent=email_sent,
    )
