from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select

from app.db.engine import AsyncSessionDep
from app.modules.consents.permissions import AcceptedGirlDep
from app.modules.girls.models import Girl


async def get_current_girl(session: AsyncSessionDep, user: AcceptedGirlDep) -> Girl:
    """O registro de menina da conta logada, que aceitou a versão atual dos termos.

    Só contas de menina chegam aqui: coordenadora e curadoria levam 403 antes
    de qualquer consulta (RNF-F31.02). Sem o aceite da versão atual, 403
    {"error": "terms_not_accepted"}: a comparação com listas oficiais depende
    dos termos (RN-20).
    """
    girl = await session.scalar(select(Girl).where(Girl.user_id == user.id))

    if girl is None:
        # Não deveria acontecer: o cadastro (#51, #52) sempre cria ou liga um.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Menina não encontrada")

    return girl


CurrentGirlDep = Annotated[Girl, Depends(get_current_girl)]
