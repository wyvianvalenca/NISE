"""The attendance of an action, on the coordinator side (C3, #135).

Every function here receives an action that the route already loaded filtered
by the coordinator's groups (GroupActionDep), so none of them looks at another
group's data (RNF-G.03).
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, ActionStatus, Participation
from app.modules.actions.service import ACTION_TIMEZONE, compute_status
from app.modules.attendance.schemas import (
    AttendanceActionOut,
    AttendanceGirlOut,
    AttendancePageOut,
)
from app.modules.cities.models import City
from app.modules.girls.models import Girl

# Optional column of the lists, shown only when some girl has it (RF-F1.14).
# WhatsApp and "Série" come with the registration of C2 (#232).
STUDY_STAGE_COLUMN = "study_stage"


async def registrations_of(
    session: AsyncSession, action_id: int
) -> list[tuple[Participation, Girl]]:
    """The registrations of the action with their girls, in alphabetical order."""
    rows = await session.execute(
        select(Participation, Girl)
        .join(Girl, Girl.id == Participation.girl_id)
        .where(Participation.action_id == action_id)
        .order_by(Girl.name, Participation.id)
    )
    return [(participation, girl) for participation, girl in rows]


def _girl_out(participation: Participation, girl: Girl) -> AttendanceGirlOut:
    return AttendanceGirlOut(
        id=participation.id,
        name=girl.name,
        email=girl.email,
        study_stage=girl.study_stage,
    )


async def build_attendance_page(
    session: AsyncSession, action: Action, today: date
) -> AttendancePageOut:
    """The page of one action of the coordinator's group, around the attendance."""
    registrations = await registrations_of(session, action.id)
    status = compute_status(action, len(registrations), today)

    city_name = None
    if action.city_ibge_code is not None:
        city_name = await session.scalar(
            select(City.name).where(City.id == action.city_ibge_code)
        )

    last_registered_on = max(
        (
            participation.created_at.astimezone(ACTION_TIMEZONE).date()
            for participation, _ in registrations
        ),
        default=None,
    )
    columns = (
        [STUDY_STAGE_COLUMN]
        if any(girl.study_stage is not None for _, girl in registrations)
        else []
    )

    return AttendancePageOut(
        action=AttendanceActionOut(
            id=action.id,
            name=action.name,
            type=action.type,
            starts_on=action.starts_on,
            ends_on=action.ends_on,
            starts_at_time=action.starts_at_time,
            ends_at_time=action.ends_at_time,
            format=action.format,
            city_name=city_name,
            visibility=action.visibility,
            created_on=action.created_at.astimezone(ACTION_TIMEZONE).date(),
        ),
        status=status,
        today=today,
        # They close by themselves on the day of the event (RF-F1.16), even if
        # the coordinator never closed them.
        registrations_open=action.registrations_open and today < action.starts_on,
        can_delete=status is not ActionStatus.CONCLUDED,
        registered_count=len(registrations),
        last_registered_on=last_registered_on,
        columns=columns,
        girls=[_girl_out(participation, girl) for participation, girl in registrations],
    )
