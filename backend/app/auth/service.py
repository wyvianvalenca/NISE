import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import PasswordResetToken
from app.auth.schemas import LoginIn, RegisterIn
from app.auth.utils import hash_password, hash_reset_token, verify_password
from app.config import settings
from app.users.models import Role, User
from app.users.service import get_user_by_email, normalize_email

# hash falso para que os três casos tenham o mesmo tempo de execução
_DUMMY_HASH = hash_password("senha-ficticia-so-para-igualar-o-tempo")


async def register_user(session: AsyncSession, data: RegisterIn) -> User | None:
    if await get_user_by_email(session, data.email) is not None:
        return None

    user = User(
        name=data.name,
        email=normalize_email(data.email),
        password_hash=hash_password(data.password),
        role=Role.GIRL,
    )
    session.add(user)

    try:
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
