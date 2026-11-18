from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select

from app.auth.permissions import GirlDep
from app.db.engine import AsyncSessionDep
from app.modules.girls.models import Girl


async def get_current_girl(session: AsyncSessionDep, user: GirlDep) -> Girl:
    """O registro de menina da conta logada.

    Só contas de menina chegam aqui (GirlDep): coordenadora e curadoria levam
    403 antes de qualquer consulta (RNF-F31.02).
    """
    girl = await session.scalar(select(Girl).where(Girl.user_id == user.id))

    if girl is None:
        # Não deveria acontecer: o cadastro (#51, #52) sempre cria ou liga um.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Menina não encontrada")

    return girl


CurrentGirlDep = Annotated[Girl, Depends(get_current_girl)]
