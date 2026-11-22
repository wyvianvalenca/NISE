import enum

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.answers.models import Answer, AnswerStage
from app.modules.answers.schemas import PendingRatingOut
from app.modules.cities.models import City
from app.modules.girls.models import Girl
from app.modules.groups.models import Group


class RatingResult(enum.Enum):
    SAVED = "saved"
    # Ela não tem participação com presença nessa ação.
    NOTHING_TO_RATE = "nothing_to_rate"
    ALREADY_RATED = "already_rated"


async def get_pending_rating(
    session: AsyncSession, user_id: int
) -> PendingRatingOut | None:
    """A ação que a menina da sessão ainda pode avaliar, ou None (#58).

    Só entra ação em que ela tem participação com presença registrada e que ela
    ainda não avaliou. Se houver mais de uma, vem a mais recente. Quem chegou
    sozinha (M2) não tem participação, e a resposta é None: o front pula a A03.
    """
    already_rated = exists().where(
        Answer.girl_id == Participation.girl_id,
        Answer.action_id == Participation.action_id,
        Answer.stage == AnswerStage.RATING,
    )

    row = (
        await session.execute(
            select(
                Action.id,
                Action.name,
                Group.name,
                Action.starts_on,
                City.name,
            )
            .select_from(Participation)
            .join(Girl, Girl.id == Participation.girl_id)
            .join(Action, Action.id == Participation.action_id)
            .join(Group, Group.id == Action.group_id)
            # Ação online não tem cidade.
            .outerjoin(City, City.id == Action.city_ibge_code)
            .where(
                Girl.user_id == user_id,
                Participation.attended_at.is_not(None),
                ~already_rated,
            )
            .order_by(Action.starts_on.desc(), Action.id.desc())
            .limit(1)
        )
    ).first()

    if row is None:
        return None

    action_id, action_name, group_name, starts_on, city_name = row

    return PendingRatingOut(
        action_id=action_id,
        action_name=action_name,
        group_name=group_name,
        starts_on=starts_on,
        city_name=city_name,
    )


async def record_rating(
    session: AsyncSession,
    user_id: int,
    action_id: int,
    score: int,
    comment: str | None,
) -> RatingResult:
    """Grava a avaliação da ação pela menina da sessão (RF-F4.03a, RF-F4.07).

    Só avalia quem tem participação com presença registrada na ação. A segunda
    avaliação da mesma ação é recusada.
    """
    girl_id = await session.scalar(
        select(Participation.girl_id)
        .join(Girl, Girl.id == Participation.girl_id)
        .where(
            Girl.user_id == user_id,
            Participation.action_id == action_id,
            Participation.attended_at.is_not(None),
        )
    )

    if girl_id is None:
        return RatingResult.NOTHING_TO_RATE

    already_rated = await session.scalar(
        select(Answer.id).where(
            Answer.girl_id == girl_id,
            Answer.action_id == action_id,
            Answer.stage == AnswerStage.RATING,
        )
    )

    if already_rated is not None:
        return RatingResult.ALREADY_RATED

    session.add(
        Answer(
            girl_id=girl_id,
            action_id=action_id,
            stage=AnswerStage.RATING,
            score=score,
            # Comentário vazio é o mesmo que nenhum.
            comment=comment or None,
        )
    )

    try:
        await session.commit()
    except IntegrityError:
        # Dois envios ao mesmo tempo: o outro já gravou a avaliação.
        await session.rollback()
        return RatingResult.ALREADY_RATED

    return RatingResult.SAVED
