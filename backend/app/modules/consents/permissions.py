from typing import Annotated

from fastapi import Depends

from app.auth.permissions import GirlDep
from app.db.engine import AsyncSessionDep
from app.modules.consents.exceptions import TermsNotAcceptedError
from app.modules.consents.service import has_accepted_current_terms
from app.users.models import User


async def require_accepted_terms(user: GirlDep, session: AsyncSessionDep) -> User:
    """Menina logada que já aceitou a versão atual dos termos (#53).

    Sem o aceite, responde 403 {"error": "terms_not_accepted"}. Quando a equipe
    publica uma versão nova, ela precisa aceitar de novo.
    """
    if not await has_accepted_current_terms(session, user.id):
        raise TermsNotAcceptedError

    return user


# Use nas rotas da menina que leem ou mudam os dados dela (filé, perfil...).
# Ficam de fora só as rotas do próprio cadastro e dos termos.
AcceptedGirlDep = Annotated[User, Depends(require_accepted_terms)]
