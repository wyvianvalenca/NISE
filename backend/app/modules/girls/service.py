from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.girls.models import Girl, GirlTopic
from app.modules.girls.schemas import InterestsIn
from app.users.service import normalize_email


async def get_girl_by_email(session: AsyncSession, email: str) -> Girl | None:
    """Acha o registro da menina pelo e-mail, tenha ela conta ou não."""
    girl = await session.scalar(
        select(Girl).where(Girl.email == normalize_email(email))
    )

    return girl


async def save_interests(
    session: AsyncSession, user_id: int, interests: InterestsIn
) -> bool:
    """Grava os temas e a etapa de estudo no perfil da menina (RF-F10.01).

    Devolve False quando a conta não tem registro de menina. Não deveria
    acontecer: o cadastro (#51, #52) sempre cria ou liga um.
    """
    girl = await session.scalar(
        select(Girl).where(Girl.user_id == user_id).options(selectinload(Girl.topics))
    )
    if girl is None:
        return False

    # Mantém os temas que continuam e cria só os novos. Trocar a lista inteira
    # não dá: o SQLAlchemy grava as linhas novas antes de apagar as antigas, e
    # um tema escolhido de novo esbarraria no UniqueConstraint(girl_id, topic).
    chosen = set(interests.topics)
    girl.topics = [item for item in girl.topics if item.topic in chosen]
    kept = {item.topic for item in girl.topics}
    girl.topics.extend(
        GirlTopic(topic=topic) for topic in interests.topics if topic not in kept
    )

    girl.all_topics = interests.everything
    girl.study_stage = interests.stage
    await session.commit()

    return True


async def get_girl_of_user(session: AsyncSession, user_id: int) -> Girl | None:
    """O registro da menina da conta logada, ou None se a conta não tem um."""
    girl = await session.scalar(select(Girl).where(Girl.user_id == user_id))

    return girl


async def mark_file_intro_seen(session: AsyncSession, user_id: int) -> bool:
    """Guarda que ela já viu "Por que filé?" (RF-F10.02).

    Marcar de novo não muda nada. Devolve False quando a conta não tem
    registro de menina.
    """
    girl = await get_girl_of_user(session, user_id)
    if girl is None:
        return False

    if not girl.file_intro_seen:
        girl.file_intro_seen = True
        await session.commit()

    return True
