from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Response, status

from app.auth.utils import decode_access_token
from app.config import settings
from app.db.engine import AsyncSessionDep
from app.users.models import User

SESSION_COOKIE = "nise_session"


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
