import secrets
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.exceptions import SignupError, SignupErrorCode
from app.auth.google import GoogleProfile
from app.auth.models import PasswordResetToken
from app.auth.schemas import EmailSignupIn, GoogleSignupCompleteIn, LoginIn
from app.auth.utils import (
    MINIMUM_PASSWORD_LENGTH,
    PendingSignup,
    hash_password,
    hash_reset_token,
    verify_password,
)
from app.config import settings
from app.modules.cities.service import ensure_city_exists
from app.modules.consents.service import has_accepted_current_terms
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


def _check_birth_date(birth_date: date) -> None:
    """A regra de idade do cadastro (RN-03, RF-F7.01), igual para e-mail e Google.

    Vem antes de qualquer consulta ou gravação: de quem tem menos de 13 anos,
    nada do que ela preencheu fica.
    """
    age = check_age(birth_date)
    if age is AgeCheck.UNDER_13:
        raise SignupError(SignupErrorCode.UNDER_13)
    if age is AgeCheck.INVALID_BIRTH_DATE:
        raise SignupError(SignupErrorCode.INVALID_BIRTH_DATE)


def _check_signup_fields(data: EmailSignupIn) -> None:
    """Confere o que não precisa do banco. Levanta SignupError na primeira falha."""
    _check_birth_date(data.birth_date)

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
    google_subject: str | None = None,
) -> User | None:
    """Grava a conta nova da menina e liga o registro dela a essa conta.

    Usado pelo cadastro por e-mail (#51) e pelo Google (#52), que manda o
    `google_subject` para ligar a conta ao Google. Quem chama já conferiu
    idade, cidade e convite. Devolve None quando o e-mail já tem conta.
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
        if google_subject is not None:
            session.add(
                OAuthAccount(
                    user_id=user.id,
                    provider=Provider.GOOGLE,
                    provider_user_id=google_subject,
                )
            )
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return None

    return user


async def complete_google_signup(
    session: AsyncSession, pending: PendingSignup, data: GoogleSignupCompleteIn
) -> User | None:
    """Cria a conta da menina que veio do Google, com data e cidade (A02b, #52).

    Levanta SignupError (ou InvalidCityError) quando algum dado é recusado, e
    devolve None quando a conta já existe (criada em outra aba, por exemplo).
    """
    _check_birth_date(data.birth_date)
    await ensure_city_exists(session, data.city_id)
    # Se o convite venceu durante o cadastro, a tela avisa e ela segue como
    # quem chegou sozinha (o mesmo do cadastro por e-mail).
    invite = None if data.without_invite else pending.invite
    origin_group_id = await _invite_group_id(session, invite)

    profile = pending.profile
    email = normalize_email(profile.email)

    # Só confere: ligar o Google a uma conta que já existe é papel do callback.
    if await _get_user_by_google_subject(session, profile.subject) is not None:
        return None
    if await get_user_by_email(session, email) is not None:
        return None

    user = User(name=profile.name, email=email, password_hash=None, role=Role.GIRL)

    return await _save_girl_account(
        session,
        user,
        birth_date=data.birth_date,
        city_id=data.city_id,
        origin_group_id=origin_group_id,
        google_subject=profile.subject,
    )


async def authenticate_user(session: AsyncSession, data: LoginIn) -> User | None:
    user = await get_user_by_email(session, data.email)

    if user is None or user.password_hash is None:
        verify_password(data.password, _DUMMY_HASH)
        return None

    if not verify_password(data.password, user.password_hash):
        return None

    return user


# Para onde cada uma vai depois de entrar (A15, #330).
COORDINATOR_HOME = "/coordenacao/acoes"
# A porta do filé: na primeira vez explica o que é (A06·0), depois leva ao
# Descobrir.
GIRL_HOME = "/por-que-file"
# Quem criou a conta e parou antes dos termos continua de onde parou (H3).
TERMS_PATH = "/cadastro/termos"


async def home_path(session: AsyncSession, user: User) -> str:
    """A primeira tela depois de entrar, com e-mail e senha ou com o Google."""
    if user.role is Role.COORDINATOR:
        return COORDINATOR_HOME

    if user.role is Role.GIRL:
        if not await has_accepted_current_terms(session, user.id):
            return TERMS_PATH
        return GIRL_HOME

    # A equipe NISE não tem telas: a curadoria é feita por scripts.
    return "/"


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
    # Trava a conta até o commit. Sem isso, dois pedidos ao mesmo tempo (o
    # pedido roda em segundo plano, então pedidos seguidos se sobrepõem)
    # invalidavam os mesmos links e deixavam dois abertos. Com a trava, o
    # segundo espera o primeiro gravar e invalida o link dele.
    await session.scalar(select(User.id).where(User.id == user.id).with_for_update())

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


def _is_usable(reset_token: PasswordResetToken, now: datetime) -> bool:
    """O link não foi usado nem trocado por um mais novo, e não venceu."""
    return reset_token.used_at is None and reset_token.expires_at > now


async def find_reset_token_user(session: AsyncSession, token: str) -> User | None:
    """A dona do link de nova senha, ou None se o link não vale mais.

    Só confere: quem troca a senha e gasta o link é o reset_password. A A16b
    usa para mostrar o e-mail da conta antes de ela digitar a senha nova.
    """
    stmt = select(PasswordResetToken).where(
        PasswordResetToken.token_hash == hash_reset_token(token)
    )
    reset_token = await session.scalar(stmt)

    if reset_token is None or not _is_usable(reset_token, datetime.now(UTC)):
        return None

    return await session.get(User, reset_token.user_id)


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

    if reset_token is None or not _is_usable(reset_token, now):
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
