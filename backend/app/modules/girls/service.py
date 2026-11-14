from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.girls.models import Girl
from app.users.service import normalize_email


async def get_girl_by_email(session: AsyncSession, email: str) -> Girl | None:
    """Acha o registro da menina pelo e-mail, tenha ela conta ou não."""
    girl = await session.scalar(
        select(Girl).where(Girl.email == normalize_email(email))
    )

    return girl
