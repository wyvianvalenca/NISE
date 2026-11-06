import secrets
from typing import Annotated

import httpx2
from fastapi import APIRouter, Cookie, HTTPException, Response, status
from fastapi.responses import RedirectResponse

from app.auth.google import (
    GoogleProfile,
    build_authorization_url,
    exchange_code,
    make_code_challenge,
    new_code_verifier,
    validate_id_token,
)
from app.auth.permissions import (
    GOOGLE_STATE_COOKIE,
    GOOGLE_VERIFIER_COOKIE,
    CurrentUserDep,
    clear_google_oauth_cookies,
    clear_pending_signup_cookie,
    clear_session_cookie,
    set_google_oauth_cookies,
    set_pending_signup_cookie,
    set_session_cookie,
)
from app.auth.schemas import LoginIn, RegisterIn
from app.auth.service import authenticate_user, find_oauth_user, register_user
from app.auth.utils import create_access_token, create_pending_signup_token
from app.db.engine import AsyncSessionDep
from app.users.models import User
from app.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])

GOOGLE_SUCCESS_URL = "/"
GOOGLE_SIGNUP_URL = "/cadastro/google"
GOOGLE_ERROR_URL = "/?erro=google"


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


@router.get("/google/login")
async def google_login() -> RedirectResponse:
    state = secrets.token_urlsafe(32)
    code_verifier = new_code_verifier()
    url = build_authorization_url(state, make_code_challenge(code_verifier))

    response = RedirectResponse(url, status_code=status.HTTP_302_FOUND)
    set_google_oauth_cookies(response, state, code_verifier)
    return response


async def _google_profile(
    code: str | None,
    state: str | None,
    saved_state: str | None,
    code_verifier: str | None,
) -> GoogleProfile | None:

    if code is None or state is None or saved_state is None or code_verifier is None:
        return None

    if not secrets.compare_digest(state.encode(), saved_state.encode()):
        return None

    async with httpx2.AsyncClient(timeout=10) as http:
        id_token = await exchange_code(http, code, code_verifier)

    if id_token is None:
        return None

    return await validate_id_token(id_token)


@router.get("/google/callback")
async def google_callback(
    session: AsyncSessionDep,
    code: str | None = None,
    state: str | None = None,
    saved_state: Annotated[str | None, Cookie(alias=GOOGLE_STATE_COOKIE)] = None,
    code_verifier: Annotated[str | None, Cookie(alias=GOOGLE_VERIFIER_COOKIE)] = None,
) -> RedirectResponse:
    profile = await _google_profile(code, state, saved_state, code_verifier)

    if profile is None:
        response = RedirectResponse(GOOGLE_ERROR_URL, status_code=status.HTTP_302_FOUND)
    else:
        user = await find_oauth_user(session, profile)

        if user is not None:
            response = RedirectResponse(
                GOOGLE_SUCCESS_URL, status_code=status.HTTP_302_FOUND
            )
            set_session_cookie(response, create_access_token(user.id))
            clear_pending_signup_cookie(response)
        else:
            response = RedirectResponse(
                GOOGLE_SIGNUP_URL, status_code=status.HTTP_302_FOUND
            )
            set_pending_signup_cookie(response, create_pending_signup_token(profile))

            clear_session_cookie(response)

    clear_google_oauth_cookies(response)
    return response
