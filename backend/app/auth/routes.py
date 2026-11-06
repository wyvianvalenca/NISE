from fastapi import APIRouter, HTTPException, Response, status

from app.auth.permissions import (
    CurrentUserDep,
    clear_session_cookie,
    set_session_cookie,
)
from app.auth.schemas import LoginIn, RegisterIn
from app.auth.service import authenticate_user, register_user
from app.auth.utils import create_access_token
from app.db.engine import AsyncSessionDep
from app.users.models import User
from app.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUserDep) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    clear_session_cookie(response)


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterIn, session: AsyncSessionDep, response: Response
) -> User:
    user = await register_user(session, data)

    if user is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "E-mail já cadastrado")

    set_session_cookie(response, create_access_token(user.id))

    return user


@router.post("/login", response_model=UserOut)
async def login(data: LoginIn, session: AsyncSessionDep, response: Response) -> User:
    user = await authenticate_user(session, data)

    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha incorretos")

    set_session_cookie(response, create_access_token(user.id))

    return user
