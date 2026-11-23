from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.cities.models import City
from app.modules.consents.schemas import GroupOrigin, SelfOrigin
from app.modules.consents.service import get_origin_group_name
from app.modules.girls.models import Girl, GirlTopic
from app.modules.girls.schemas import InterestsIn, OptionOut, ProfileDetailsOut
from app.modules.girls.utils import STUDY_STAGE_LABELS, TOPIC_LABELS
from app.users.models import OAuthAccount, Provider, User
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


async def get_profile_details(
    session: AsyncSession, user: User
) -> ProfileDetailsOut | None:
    """Tudo o que a A10 mostra do perfil da conta logada (RF-F7.11, RF-F7.12).

    Devolve None quando a conta não tem registro de menina.
    """
    girl = await session.scalar(
        select(Girl).where(Girl.user_id == user.id).options(selectinload(Girl.topics))
    )
    if girl is None:
        return None

    city = None
    if girl.city_ibge_code is not None:
        city = await session.scalar(
            select(City.name + ", " + City.state).where(City.id == girl.city_ibge_code)
        )

    # A origem vem do servidor (origin_group_id), nunca do front (RN-01, RN-04).
    group_name = await get_origin_group_name(session, user.id)
    origin = GroupOrigin(group_name=group_name) if group_name else SelfOrigin()

    google_account = await session.scalar(
        select(OAuthAccount.id).where(
            OAuthAccount.user_id == user.id, OAuthAccount.provider == Provider.GOOGLE
        )
    )

    # Os temas saem na ordem da lista da A05, não na ordem em que foram gravados.
    chosen = {item.topic for item in girl.topics}
    topics = [
        OptionOut(code=topic.value, label=label)
        for topic, label in TOPIC_LABELS.items()
        if topic in chosen
    ]
    stage = None
    if girl.study_stage is not None:
        stage = OptionOut(
            code=girl.study_stage.value, label=STUDY_STAGE_LABELS[girl.study_stage]
        )

    return ProfileDetailsOut(
        name=user.name,
        email=user.email,
        city=city,
        has_password=user.password_hash is not None,
        google=google_account is not None,
        topics=topics,
        all_topics=girl.all_topics,
        study_stage=stage,
        origin=origin,
        opportunity_emails=user.opportunity_emails,
    )
