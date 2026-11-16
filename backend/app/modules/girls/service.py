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
