from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Response, status

from app.auth.utils import (
    PendingSignup,
    decode_access_token,
    decode_pending_signup_token,
)
from app.config import settings
from app.db.engine import AsyncSessionDep
from app.users.models import Role, User

SESSION_COOKIE = "nise_session"
# Aviso de que este navegador tem sessão, gravado e apagado junto com ela. Não
# é httpOnly, para a A01 ler e mostrar o carregamento em vez das boas-vindas
# enquanto pergunta ao back para onde ela vai. Não é segredo nem dá acesso a
# nada: quem decide é sempre o cookie da sessão.
SIGNED_IN_HINT_COOKIE = "nise_entrou"
PENDING_SIGNUP_COOKIE = "nise_cadastro_pendente"
GOOGLE_STATE_COOKIE = "nise_google_state"
GOOGLE_VERIFIER_COOKIE = "nise_google_verifier"
# Código do convite com que ela foi ao Google (RN-29). Fica junto do state.
GOOGLE_INVITE_COOKIE = "nise_google_convite"
GOOGLE_COOKIE_PATH = "/api/auth/google"

GOOGLE_COOKIE_MAX_AGE = 10 * 60


async def get_current_user(
    session: AsyncSessionDep,
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    pending: Annotated[str | None, Cookie(alias=PENDING_SIGNUP_COOKIE)] = None,
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não autenticada",
    )

    user_id = decode_access_token(token) if token else None

    if user_id is None:
        # Quem só tem o cadastro pendente do Google ainda não tem conta nem
        # sessão: a resposta diz que falta completar o cadastro (A02b, #52).
        if pending and decode_pending_signup_token(pending) is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cadastro incompleto",
            )
        raise unauthorized

    user = await session.get(User, user_id)

    # Conta excluída (RF-F7.09, #394): o cookie antigo, de qualquer aba ou
    # aparelho, deixa de valer.
    if user is None or user.deleted_at is not None:
        raise unauthorized

    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def get_session_user_id(
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> int:
    """Só o id da sessão, sem olhar a conta no banco.

    Serve à exclusão de conta (#394): uma segunda chamada, de outra aba, já vem
    com a conta excluída e precisa responder 204, não 401.
    """
    user_id = decode_access_token(token) if token else None

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticada",
        )

    return user_id


SessionUserIdDep = Annotated[int, Depends(get_session_user_id)]


async def get_pending_signup(
    token: Annotated[str | None, Cookie(alias=PENDING_SIGNUP_COOKIE)] = None,
) -> PendingSignup:
    """O cadastro pelo Google que espera a data de nascimento e a cidade (#52).

    Não é uma sessão: com ele, ela só vê o próprio nome e e-mail e completa ou
    descarta o cadastro.
    """
    pending = decode_pending_signup_token(token) if token else None

    if pending is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum cadastro pendente",
        )

    return pending


PendingSignupDep = Annotated[PendingSignup, Depends(get_pending_signup)]


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    response.set_cookie(
        key=SIGNED_IN_HINT_COOKIE,
        value="1",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    response.delete_cookie(
        key=SIGNED_IN_HINT_COOKIE,
        path="/",
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def set_pending_signup_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=PENDING_SIGNUP_COOKIE,
        value=token,
        max_age=settings.pending_signup_expire_minutes * 60,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_pending_signup_cookie(response: Response) -> None:
    response.delete_cookie(
        key=PENDING_SIGNUP_COOKIE,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def set_google_oauth_cookies(
    response: Response, state: str, code_verifier: str, invite: str | None = None
) -> None:
    cookies = [(GOOGLE_STATE_COOKIE, state), (GOOGLE_VERIFIER_COOKIE, code_verifier)]
    if invite is not None:
        cookies.append((GOOGLE_INVITE_COOKIE, invite))

    for key, value in cookies:
        response.set_cookie(
            key=key,
            value=value,
            max_age=GOOGLE_COOKIE_MAX_AGE,
            path=GOOGLE_COOKIE_PATH,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
        )

    # Sem convite agora, um que sobrou de uma tentativa anterior não vale.
    if invite is None:
        _delete_google_cookie(response, GOOGLE_INVITE_COOKIE)


def _delete_google_cookie(response: Response, key: str) -> None:
    response.delete_cookie(
        key=key,
        path=GOOGLE_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_google_oauth_cookies(response: Response) -> None:
    for key in (GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, GOOGLE_INVITE_COOKIE):
        _delete_google_cookie(response, key)


# Cada rota lista os papeis aceitos.
def require_role(*roles: Role) -> Callable[[User], Awaitable[User]]:
    if not roles:
        raise ValueError("Informe ao menos um papel")

    async def check_role(user: CurrentUserDep) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão"
            )
        return user

    return check_role


# Atalhos
CoordinatorDep = Annotated[User, Depends(require_role(Role.COORDINATOR))]
GirlDep = Annotated[User, Depends(require_role(Role.GIRL))]
NiseTeamDep = Annotated[User, Depends(require_role(Role.NISE_TEAM))]
