"""The attendance of an action, on the coordinator side (C3, #135).

Every function here receives an action that the route already loaded filtered
by the coordinator's groups (GroupActionDep), so none of them looks at another
group's data (RNF-G.03).
"""

from datetime import date

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, ActionStatus, Participation
from app.modules.actions.service import ACTION_TIMEZONE, compute_status
from app.modules.attendance.exceptions import (
    AlreadyConcludedError,
    TooEarlyError,
    UnknownRegistrationError,
)
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
        saved_present=participation.saved_present,
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
        saved_count=sum(
            1 for participation, _ in registrations if participation.saved_present
        ),
        last_registered_on=last_registered_on,
        columns=columns,
        girls=[_girl_out(participation, girl) for participation, girl in registrations],
    )


async def lock_action(session: AsyncSession, action: Action) -> Action:
    """Locks the action row until the commit and reads it again.

    Saving, concluding and marking afterwards all start here, so two of them on
    the same action never run at the same time: a double tap on "Concluir
    presença" waits for the first one and then sees it concluded.
    """
    locked = await session.scalar(
        select(Action)
        .where(Action.id == action.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert locked is not None  # the route has just read it
    return locked


def ensure_awaiting_attendance(action: Action, today: date) -> None:
    """Marks are only taken from the day of the event until it is concluded."""
    if today < action.starts_on:
        raise TooEarlyError
    if action.attendance_registered_at is not None:
        raise AlreadyConcludedError


async def ensure_registrations(
    session: AsyncSession, action: Action, ids: set[int]
) -> None:
    """Every id must be a registration of this very action."""
    if not ids:
        return
    found = set(
        (
            await session.scalars(
                select(Participation.id).where(
                    Participation.action_id == action.id, Participation.id.in_(ids)
                )
            )
        ).all()
    )
    if found != ids:
        raise UnknownRegistrationError


async def save_marks(
    session: AsyncSession, action: Action, present_ids: list[int], today: date
) -> None:
    """ "Salvar e continuar depois" (#340, RF-F3.04, D-81).

    Replaces the saved marks of the action: the girls in `present_ids` are
    marked and every other one is unmarked. Nothing else changes: no e-mail,
    no attendance, no filé, and the action stays "Aguardando presença".
    """
    action = await lock_action(session, action)
    ensure_awaiting_attendance(action, today)
    ids = set(present_ids)
    await ensure_registrations(session, action, ids)

    await session.execute(
        update(Participation)
        .where(Participation.action_id == action.id)
        .values(saved_present=Participation.id.in_(ids) if ids else False)
    )
    await session.commit()
