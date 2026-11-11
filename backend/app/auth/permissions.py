from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Response, status

from app.auth.utils import decode_access_token
from app.config import settings
from app.db.engine import AsyncSessionDep
from app.users.models import Role, User

SESSION_COOKIE = "nise_session"
PENDING_SIGNUP_COOKIE = "nise_cadastro_pendente"
GOOGLE_STATE_COOKIE = "nise_google_state"
GOOGLE_VERIFIER_COOKIE = "nise_google_verifier"
GOOGLE_COOKIE_PATH = "/api/auth/google"

GOOGLE_COOKIE_MAX_AGE = 10 * 60


async def get_current_user(
    session: AsyncSessionDep,
    token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não autenticada",
    )

    if token is None:
        raise unauthorized

    user_id = decode_access_token(token)

    if user_id is None:
        raise unauthorized

    user = await session.get(User, user_id)

    if user is None:
        raise unauthorized

    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


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


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        httponly=True,
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
    response: Response, state: str, code_verifier: str
) -> None:
    for key, value in (
        (GOOGLE_STATE_COOKIE, state),
        (GOOGLE_VERIFIER_COOKIE, code_verifier),
    ):
        response.set_cookie(
            key=key,
            value=value,
            max_age=GOOGLE_COOKIE_MAX_AGE,
            path=GOOGLE_COOKIE_PATH,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
        )


def clear_google_oauth_cookies(response: Response) -> None:
    for key in (GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE):
        response.delete_cookie(
            key=key,
            path=GOOGLE_COOKIE_PATH,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
        )


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
