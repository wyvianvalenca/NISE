import secrets
from typing import Annotated

import httpx2
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Cookie,
    HTTPException,
    Query,
    Response,
    status,
)
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.exceptions import SignupError, SignupErrorCode
from app.auth.google import (
    GoogleProfile,
    build_authorization_url,
    exchange_code,
    make_code_challenge,
    new_code_verifier,
    validate_id_token,
)
from app.auth.permissions import (
    GOOGLE_INVITE_COOKIE,
    GOOGLE_STATE_COOKIE,
    GOOGLE_VERIFIER_COOKIE,
    CurrentUserDep,
    PendingSignupDep,
    clear_google_oauth_cookies,
    clear_pending_signup_cookie,
    clear_session_cookie,
    set_google_oauth_cookies,
    set_pending_signup_cookie,
    set_session_cookie,
)
from app.auth.reset_email import send_reset_email
from app.auth.schemas import (
    EmailSignupIn,
    ForgotPasswordIn,
    GoogleSignupCompleteIn,
    LoginIn,
    PendingSignupOut,
    ResetPasswordIn,
    ResetTokenIn,
    ResetTokenOut,
    SessionOut,
    SignupOut,
)
from app.auth.service import (
    authenticate_user,
    complete_google_signup,
    create_password_reset_token,
    find_oauth_user,
    find_reset_token_user,
    home_path,
    reset_password,
    signup_with_email,
)
from app.auth.utils import (
    MINIMUM_PASSWORD_LENGTH,
    PendingSignup,
    create_access_token,
    create_pending_signup_token,
)
from app.db.engine import AsyncSessionDep
from app.users.models import User
from app.users.schemas import UserOut
from app.users.service import get_user_by_email, normalize_email

router = APIRouter(prefix="/auth", tags=["Auth"])

GOOGLE_SIGNUP_URL = "/cadastro/google"
# A A15 mostra o aviso. Vale também para quem começou em "Criar conta com o
# Google": ela tenta de novo por lá ou toca "Criar conta".
GOOGLE_ERROR_URL = "/entrar?erro=google"


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUserDep) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    clear_session_cookie(response)


# Cadastro da menina por e-mail e senha (A02, #51). A resposta já abre a
# sessão, e o próximo passo é sempre o aceite dos termos (H3).
@router.post(
    "/signup/email",
    response_model=SignupOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_409_CONFLICT: {"description": "E-mail já cadastrado"},
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": 'Dado recusado, ex.: {"error": "under_13"}'
        },
    },
)
async def signup_email(
    data: EmailSignupIn, session: AsyncSessionDep, response: Response
) -> SignupOut:
    user = await signup_with_email(session, data)

    if user is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "E-mail já cadastrado")

    set_session_cookie(response, create_access_token(user.id))

    return SignupOut.model_validate(user)


# Cadastro pelo Google (A02b, #52). O callback deixa o que veio do Google no
# cookie do cadastro pendente; nada vai para o banco antes de ela informar a
# data de nascimento (RN-03).
@router.get(
    "/signup/pending",
    response_model=PendingSignupOut,
    responses={status.HTTP_404_NOT_FOUND: {"description": "Sem cadastro pendente"}},
)
async def pending_signup(pending: PendingSignupDep) -> PendingSignupOut:
    # O e-mail como vai ficar na conta (o mesmo normalize_email do cadastro).
    return PendingSignupOut(
        name=pending.profile.name,
        email=normalize_email(pending.profile.email),
        invite=pending.invite,
    )


@router.post(
    "/signup/complete",
    response_model=SignupOut,
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_404_NOT_FOUND: {"description": "Sem cadastro pendente"},
        status.HTTP_409_CONFLICT: {"description": "Conta já existe"},
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": 'Dado recusado, ex.: {"error": "under_13"}'
        },
    },
)
async def complete_signup(
    data: GoogleSignupCompleteIn,
    pending: PendingSignupDep,
    session: AsyncSessionDep,
    response: Response,
) -> SignupOut | JSONResponse:
    try:
        user = await complete_google_signup(session, pending, data)
    except SignupError as error:
        if error.code is not SignupErrorCode.UNDER_13:
            raise
        # Menor de 13: o que veio do Google some já aqui, sem depender do
        # front chamar o discard (RN-03).
        refused = JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"error": error.code.value},
        )
        clear_pending_signup_cookie(refused)
        return refused

    if user is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Conta já existe")

    set_session_cookie(response, create_access_token(user.id))
    clear_pending_signup_cookie(response)

    return SignupOut.model_validate(user)


# "Usar outra conta" e menor de 13 na A02b: some o que veio do Google, sem
# criar conta. Responde 204 mesmo sem cadastro pendente, para o front não
# precisar tratar esse caso.
@router.post("/signup/discard", status_code=status.HTTP_204_NO_CONTENT)
async def discard_signup(response: Response) -> None:
    clear_pending_signup_cookie(response)


# Entrar com e-mail e senha (A15, #330). A resposta diz a próxima tela, a
# mesma para onde o Google mandaria.
@router.post(
    "/login",
    response_model=SessionOut,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "E-mail ou senha incorretos"}
    },
)
async def login(
    data: LoginIn, session: AsyncSessionDep, response: Response
) -> SessionOut:
    user = await authenticate_user(session, data)

    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha incorretos")

    set_session_cookie(response, create_access_token(user.id))

    return await _session_out(session, user)


async def _session_out(session: AsyncSession, user: User) -> SessionOut:
    return SessionOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        next_path=await home_path(session, user),
    )


# Recuperar o acesso (A16 e A16b, #331, RF-S2.04). Vale para menina e
# coordenadora, e também cria uma senha para quem só entrava pelo Google.

# Recusas que o front sabe mostrar, no mesmo formato do cadastro.
INVALID_TOKEN = {"error": "invalid_token"}
PASSWORD_TOO_SHORT = {"error": "password_too_short"}


@router.post("/password/forgot", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(
    data: ForgotPasswordIn,
    session: AsyncSessionDep,
    background_tasks: BackgroundTasks,
) -> None:
    # Responde igual exista a conta ou não: a A16 não pode dizer quem tem
    # conta. O e-mail sai depois da resposta, em segundo plano.
    user = await get_user_by_email(session, data.email)

    if user is not None:
        token = await create_password_reset_token(session, user)
        background_tasks.add_task(send_reset_email, user.email, token)


@router.post(
    "/password/reset/check",
    response_model=ResetTokenOut,
    responses={
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": 'Link vencido, usado ou desconhecido: {"error": '
            '"invalid_token"}'
        }
    },
)
async def check_reset_token(
    data: ResetTokenIn, session: AsyncSessionDep
) -> ResetTokenOut | JSONResponse:
    user = await find_reset_token_user(session, data.token)

    if user is None:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content=INVALID_TOKEN
        )

    return ResetTokenOut(email=user.email)


# "Salvar e entrar": troca a senha, gasta o link e já abre a sessão.
@router.post(
    "/password/reset",
    response_model=SessionOut,
    responses={
        status.HTTP_422_UNPROCESSABLE_CONTENT: {
            "description": 'Recusa, ex.: {"error": "invalid_token"} ou '
            '{"error": "password_too_short"}'
        }
    },
)
async def reset_password_route(
    data: ResetPasswordIn, session: AsyncSessionDep, response: Response
) -> SessionOut | JSONResponse:
    if len(data.password) < MINIMUM_PASSWORD_LENGTH:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=PASSWORD_TOO_SHORT,
        )

    user = await reset_password(session, data.token, data.password)

    if user is None:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content=INVALID_TOKEN
        )

    set_session_cookie(response, create_access_token(user.id))

    return await _session_out(session, user)


# O front também manda switch_account=1 em "Usar outra conta" (A02b). Não
# muda nada aqui: o Google sempre mostra a escolha de conta (select_account).
@router.get("/google/login")
async def google_login(
    invite: Annotated[str | None, Query(max_length=64)] = None,
) -> RedirectResponse:
    state = secrets.token_urlsafe(32)
    code_verifier = new_code_verifier()
    url = build_authorization_url(state, make_code_challenge(code_verifier))

    response = RedirectResponse(url, status_code=status.HTTP_302_FOUND)
    # O convite fica num cookie e não no state: o Google não precisa saber dele.
    # Ele só é conferido ao completar o cadastro.
    set_google_oauth_cookies(response, state, code_verifier, invite or None)
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
    invite: Annotated[str | None, Cookie(alias=GOOGLE_INVITE_COOKIE)] = None,
) -> RedirectResponse:
    profile = await _google_profile(code, state, saved_state, code_verifier)

    if profile is None:
        response = RedirectResponse(GOOGLE_ERROR_URL, status_code=status.HTTP_302_FOUND)
    else:
        user = await find_oauth_user(session, profile)

        if user is not None:
            response = RedirectResponse(
                await home_path(session, user), status_code=status.HTTP_302_FOUND
            )
            set_session_cookie(response, create_access_token(user.id))
            clear_pending_signup_cookie(response)
        else:
            response = RedirectResponse(
                GOOGLE_SIGNUP_URL, status_code=status.HTTP_302_FOUND
            )
            pending = PendingSignup(profile=profile, invite=invite)
            set_pending_signup_cookie(response, create_pending_signup_token(pending))

            clear_session_cookie(response)

    clear_google_oauth_cookies(response)
    return response
