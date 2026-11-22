import enum
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admissions.declaration import course_name
from app.modules.admissions.service import (
    add_self_declared_enrollment,
    current_enrollment,
)
from app.modules.followup.models import (
    FollowupActivity,
    FollowupAnswer,
    FollowupHelp,
    StillEnrolled,
)
from app.modules.followup.schemas import (
    CurrentCourseOut,
    CurrentFollowupOut,
    FollowupIn,
)
from app.modules.followup.utils import OpenRound, open_round
from app.modules.girls.models import Girl
from app.modules.girls.utils import today_in_maceio
from app.users.models import User


class FollowupResult(enum.Enum):
    SAVED = "saved"
    # Não há rodada aberta hoje, ou a rodada enviada já fechou.
    NO_OPEN_ROUND = "no_open_round"
    ALREADY_ANSWERED = "already_answered"
    # A pergunta 3 enviada não é a que ela vê: "Continua nesse curso?" sem curso
    # registrado, ou a pergunta de entrada com curso registrado.
    INVALID_COURSE_ANSWER = "invalid_course_answer"


async def _open_round_for(
    session: AsyncSession, user_id: int, now: datetime | None
) -> tuple[int, str, OpenRound] | None:
    """A menina da sessão, o nome dela e a rodada aberta hoje, ou None.

    As rodadas contam da criação da conta (User.created_at, RN-02), não do
    registro da menina: quem foi importada de uma lista tem o registro antes
    da conta.
    """
    row = (
        await session.execute(
            select(Girl.id, User.name, User.created_at)
            .join(User, User.id == Girl.user_id)
            .where(Girl.user_id == user_id)
        )
    ).first()

    if row is None:
        return None

    girl_id, name, account_created_at = row
    current = open_round(
        today_in_maceio(account_created_at), today=today_in_maceio(now)
    )

    if current is None:
        return None

    return girl_id, name, current


async def _already_answered(
    session: AsyncSession, girl_id: int, current: OpenRound
) -> bool:
    answer_id = await session.scalar(
        select(FollowupAnswer.id).where(
            FollowupAnswer.girl_id == girl_id,
            FollowupAnswer.round == current.round,
        )
    )
    return answer_id is not None


async def get_current_followup(
    session: AsyncSession, user_id: int, now: datetime | None = None
) -> CurrentFollowupOut | None:
    """A rodada aberta hoje para a menina da sessão, ou None (#293)."""
    found = await _open_round_for(session, user_id, now)

    if found is None:
        return None

    girl_id, name, current = found
    enrollment = await current_enrollment(session, girl_id)

    return CurrentFollowupOut(
        round=current.round,
        last_day=current.last_day,
        first_name=name.split()[0] if name.strip() else "",
        answered=await _already_answered(session, girl_id, current),
        current_course=(
            CurrentCourseOut(level=enrollment.level, course=enrollment.course)
            if enrollment
            else None
        ),
    )


async def record_followup(
    session: AsyncSession,
    user_id: int,
    data: FollowupIn,
    now: datetime | None = None,
) -> FollowupResult:
    """Grava as respostas da menina da sessão à rodada aberta (RF-F4.07).

    Só a rodada aberta hoje aceita resposta, e só uma vez. A resposta e o que ela
    muda nos cursos dela (novo ingresso, ou a data em que parou) vão no mesmo
    commit: ou grava tudo, ou nada (RNF-F6.01).
    """
    found = await _open_round_for(session, user_id, now)

    if found is None:
        return FollowupResult.NO_OPEN_ROUND

    girl_id, _, current = found

    if data.round is not current.round:
        return FollowupResult.NO_OPEN_ROUND

    if await _already_answered(session, girl_id, current):
        return FollowupResult.ALREADY_ANSWERED

    enrollment = await current_enrollment(session, girl_id)

    # "Continua nesse curso?" só para quem tem curso; a pergunta de entrada, só
    # para quem não tem (D-63).
    if data.still_enrolled is not None and enrollment is None:
        return FollowupResult.INVALID_COURSE_ANSWER
    if data.still_enrolled is None and enrollment and data.course_status:
        return FollowupResult.INVALID_COURSE_ANSWER

    today = today_in_maceio(now)
    # "Mudei de curso" e "Parei por enquanto": o ingresso fica, com a data em
    # que ela saiu (RF-F6.05, RF-F6.06).
    if enrollment and data.still_enrolled in (
        StillEnrolled.CHANGED,
        StillEnrolled.STOPPED,
    ):
        enrollment.left_on = today
    if data.level is not None:
        assert data.course is not None
        add_self_declared_enrollment(
            session,
            girl_id,
            data.level,
            course_name(data.course, data.other_course),
            data.institution,
            now,
        )

    session.add(
        FollowupAnswer(
            girl_id=girl_id,
            round=current.round,
            course_status=data.course_status,
            still_enrolled=data.still_enrolled,
            computing_view=data.computing_view,
            future_self=data.future_self,
            # Comentário vazio é o mesmo que nenhum.
            comment=data.comment or None,
            activities=[FollowupActivity(activity=a) for a in data.activities],
            helps=[FollowupHelp(help=h) for h in data.helps],
        )
    )

    try:
        await session.commit()
    except IntegrityError:
        # Dois envios ao mesmo tempo: o outro já gravou as respostas. Outro erro
        # de integridade não é "já respondeu": sobe.
        await session.rollback()
        if await _already_answered(session, girl_id, current):
            return FollowupResult.ALREADY_ANSWERED
        raise

    return FollowupResult.SAVED
