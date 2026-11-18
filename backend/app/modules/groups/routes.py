from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status

from app.db.engine import AsyncSessionDep
from app.modules.groups.exceptions import ExpiredInviteError, InvalidInviteError
from app.modules.groups.schemas import InviteOut
from app.modules.groups.service import get_valid_invite

router = APIRouter(prefix="/invites", tags=["Invites"])


# Rota pública: ela abre o link do convite antes de ter conta (A01b, #51).
# Para 404 e 410 o front volta para a A01, sem prender ela numa tela de erro.
@router.get(
    "/{code}",
    response_model=InviteOut,
    responses={
        status.HTTP_404_NOT_FOUND: {"description": "Convite não encontrado"},
        status.HTTP_410_GONE: {"description": "Convite vencido"},
    },
)
async def get_invite(
    session: AsyncSessionDep,
    code: Annotated[str, Path(max_length=64)],
) -> InviteOut:
    try:
        invite = await get_valid_invite(session, code)
    except ExpiredInviteError:
        raise HTTPException(status.HTTP_410_GONE, "Convite vencido") from None
    except InvalidInviteError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Convite não encontrado"
        ) from None

    return InviteOut(group_name=invite.group.name)
