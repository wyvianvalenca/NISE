from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.schemas import LoginIn, RegisterIn
from app.auth.utils import hash_password, verify_password
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
