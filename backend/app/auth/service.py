import secrets
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.exceptions import SignupError, SignupErrorCode
from app.auth.google import GoogleProfile
from app.auth.models import PasswordResetToken
from app.auth.schemas import EmailSignupIn, LoginIn
from app.auth.utils import (
    MINIMUM_PASSWORD_LENGTH,
    hash_password,
    hash_reset_token,
    verify_password,
)
from app.config import settings
from app.modules.cities.service import ensure_city_exists
from app.modules.girls.models import Girl
from app.modules.girls.service import get_girl_by_email
from app.modules.girls.utils import AgeCheck, check_age
from app.modules.groups.exceptions import InvalidInviteError
from app.modules.groups.service import get_valid_invite
from app.users.models import OAuthAccount, Provider, Role, User
from app.users.service import get_user_by_email, normalize_email
from app.users.utils import is_valid_email

# hash falso para que os três casos tenham o mesmo tempo de execução
_DUMMY_HASH = hash_password("senha-ficticia-so-para-igualar-o-tempo")


def _check_signup_fields(data: EmailSignupIn) -> None:
    """Confere o que não precisa do banco. Levanta SignupError na primeira falha."""
    # A idade vem primeiro: quem tem menos de 13 anos é recusada antes de
    # qualquer consulta ou gravação, e nada do que ela preencheu fica (RN-03).
    age = check_age(data.birth_date)
    if age is AgeCheck.UNDER_13:
        raise SignupError(SignupErrorCode.UNDER_13)
    if age is AgeCheck.INVALID_BIRTH_DATE:
        raise SignupError(SignupErrorCode.INVALID_BIRTH_DATE)

    if not is_valid_email(data.email):
        raise SignupError(SignupErrorCode.INVALID_EMAIL)

    if len(data.password) < MINIMUM_PASSWORD_LENGTH:
        raise SignupError(SignupErrorCode.PASSWORD_TOO_SHORT)


async def _invite_group_id(session: AsyncSession, code: str | None) -> int | None:
    """O grupo do convite, ou None quando ela chegou sozinha (RF-F7.04)."""
    if code is None:
        return None

    try:
        invite = await get_valid_invite(session, code)
    except InvalidInviteError:
        raise SignupError(SignupErrorCode.INVALID_INVITE) from None

    return invite.group_id


async def signup_with_email(session: AsyncSession, data: EmailSignupIn) -> User | None:
    """Cria a conta da menina com e-mail e senha (#51, RF-S2.01).

    Levanta SignupError (ou InvalidCityError) quando algum dado é recusado, e
    devolve None quando o e-mail já tem conta.
    """
    _check_signup_fields(data)
    await ensure_city_exists(session, data.city_id)
    origin_group_id = await _invite_group_id(session, data.invite)

    email = normalize_email(data.email)

    if await get_user_by_email(session, email) is not None:
        return None

    user = User(
        name=data.name,
        email=email,
        password_hash=hash_password(data.password),
        role=Role.GIRL,
    )

    return await _save_girl_account(
        session,
        user,
        birth_date=data.birth_date,
        city_id=data.city_id,
        origin_group_id=origin_group_id,
    )


async def _save_girl_account(
    session: AsyncSession,
    user: User,
    *,
    birth_date: date,
    city_id: int,
    origin_group_id: int | None,
) -> User | None:
    """Grava a conta nova da menina e liga o registro dela a essa conta.

    Usado pelo cadastro por e-mail (#51) e pelo Google (#52). Quem chama já
    conferiu idade, cidade e convite. Devolve None quando o e-mail já tem conta.
    """
    # Se ela veio de uma importação, a conta ativa esse registro em vez de
    # criar outro (RF-F2.02, RN-29).
    girl = await get_girl_by_email(session, user.email)
    if girl is not None and girl.user_id is not None:
        return None
    if girl is None:
        girl = Girl(email=user.email)
        session.add(girl)

    session.add(user)

    # O nome do cadastro vale mais que o da lista importada. A origem é a do
    # cadastro: é ela que decide o texto dos termos (H3).
    girl.name = user.name
    girl.birth_date = birth_date
    girl.city_ibge_code = city_id
    girl.origin_group_id = origin_group_id

    try:
        # O flush dá o id da usuária, para ligar o registro a ela.
        await session.flush()
        girl.user_id = user.id
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return None

    return user


async def authenticate_user(session: AsyncSession, data: LoginIn) -> User | None:
    user = await get_user_by_email(session, data.email)

    if user is None or user.password_hash is None:
        verify_password(data.password, _DUMMY_HASH)
        return None

    if not verify_password(data.password, user.password_hash):
        return None

    return user


async def _invalidate_open_tokens(
    session: AsyncSession, user_id: int, now: datetime
) -> None:
    stmt = (
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None)
        )
        .values(used_at=now)
    )
    await session.execute(stmt)


async def create_password_reset_token(session: AsyncSession, user: User) -> str:
    now = datetime.now(UTC)

    await _invalidate_open_tokens(session, user.id, now)

    token = secrets.token_urlsafe(32)

    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(token),
            expires_at=now + timedelta(minutes=settings.password_reset_expire_minutes),
        )
    )
    await session.commit()

    return token


async def reset_password(
    session: AsyncSession, token: str, new_password: str
) -> User | None:
    now = datetime.now(UTC)
    token_hash = hash_reset_token(token)
    # Calculado antes da trava, para não segurar a linha enquanto o Argon2 roda.
    password_hash = hash_password(new_password)

    stmt = (
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == token_hash)
        .with_for_update()
    )
    reset_token = await session.scalar(stmt)

    if (
        reset_token is None
        or reset_token.used_at is not None
        or reset_token.expires_at <= now
    ):
        await session.rollback()
        return None

    user = await session.get(User, reset_token.user_id)

    if user is None:
        await session.rollback()
        return None

    user.password_hash = password_hash
    reset_token.used_at = now

    await _invalidate_open_tokens(session, user.id, now)

    await session.commit()

    return user


async def _get_user_by_google_subject(
    session: AsyncSession, subject: str
) -> User | None:
    stmt = (
        select(User)
        .join(OAuthAccount, OAuthAccount.user_id == User.id)
        .where(OAuthAccount.provider_user_id == subject)
    )

    user = await session.scalar(stmt)

    return user


async def find_oauth_user(session: AsyncSession, profile: GoogleProfile) -> User | None:

    user = await _get_user_by_google_subject(session, profile.subject)
    if user is not None:
        return user

    user = await get_user_by_email(session, profile.email)
    if user is None:
        return None

    # Caso tenha conta cadastrada, não mudamos a senha, mas isso depende de verificação de email, que fica pendente (abrir issue para isso)!
    session.add(
        OAuthAccount(
            user_id=user.id, provider=Provider.GOOGLE, provider_user_id=profile.subject
        )
    )

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return await _get_user_by_google_subject(session, profile.subject)

    return user


async def create_oauth_user(
    session: AsyncSession, profile: GoogleProfile
) -> User | None:
    user = await find_oauth_user(session, profile)

    if user is not None:
        return None

    user = User(
        name=profile.name,
        password_hash=None,
        email=normalize_email(profile.email),
        role=Role.GIRL,
    )
    session.add(user)

    try:
        await session.flush()

        account = OAuthAccount(
            user_id=user.id, provider=Provider.GOOGLE, provider_user_id=profile.subject
        )

        session.add(account)

        await session.commit()
    except IntegrityError:
        await session.rollback()
        return None

    return user
