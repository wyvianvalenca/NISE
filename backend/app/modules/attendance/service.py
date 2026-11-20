"""The attendance of an action, on the coordinator side (C3, #135).

Every function here receives an action that the route already loaded filtered
by the coordinator's groups (GroupActionDep), so none of them looks at another
group's data (RNF-G.03).
"""

from datetime import date, datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, ActionStatus, Participation
from app.modules.actions.service import ACTION_TIMEZONE, compute_status
from app.modules.attendance.emails import (
    girls_without_account,
    is_valid_address,
    queue_attendance_emails,
)
from app.modules.attendance.exceptions import (
    AlreadyConcludedError,
    TooEarlyError,
    UnknownRegistrationError,
)
from app.modules.attendance.models import AttendanceEmail, AttendanceEmailKind
from app.modules.attendance.schemas import (
    AttendanceActionOut,
    AttendanceGirlOut,
    AttendancePageOut,
    WalkInIn,
    WalkInOut,
)
from app.modules.cities.models import City
from app.modules.girls.models import Girl
from app.users.service import normalize_email

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
        .execution_options(populate_existing=True)
    )
    return [(participation, girl) for participation, girl in rows]


def _girl_out(participation: Participation, girl: Girl) -> AttendanceGirlOut:
    return AttendanceGirlOut(
        id=participation.id,
        name=girl.name,
        email=girl.email,
        study_stage=girl.study_stage,
        saved_present=participation.saved_present,
        present=participation.attended_at is not None,
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
    concluded_on = (
        action.attendance_registered_at.astimezone(ACTION_TIMEZONE).date()
        if action.attendance_registered_at is not None
        else None
    )
    invites_to_send = 0
    if action.attendance_registered_at is None:
        candidates = await girls_without_account(
            session, (girl.id for _, girl in registrations)
        )
        invites_to_send = sum(
            1
            for _, girl in registrations
            if girl.id in candidates and is_valid_address(girl.email)
        )
    sent_rows = await session.execute(
        select(AttendanceEmail.kind, func.count())
        .where(
            AttendanceEmail.action_id == action.id,
            AttendanceEmail.dropped_at.is_(None),
        )
        .group_by(AttendanceEmail.kind)
    )
    sent: dict[AttendanceEmailKind, int] = {kind: total for kind, total in sent_rows}

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
        concluded_on=concluded_on,
        present_count=sum(
            1
            for participation, _ in registrations
            if participation.attended_at is not None
        ),
        invites_to_send=invites_to_send,
        invites_sent=sent.get(AttendanceEmailKind.INVITE, 0),
        evaluations_sent=sent.get(AttendanceEmailKind.EVALUATION, 0),
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


async def register_girl(
    session: AsyncSession, action: Action, data: WalkInIn
) -> tuple[Participation, Girl, bool]:
    """Puts a girl in the action from her name and e-mail (RN-29, RN-27).

    The thinnest version of the registration of C2 (#232), for "Veio sem
    inscrição?": the e-mail is compared ignoring case and spaces; a record that
    already exists (with or without an account, from any group) is linked to the
    action and never changed, and otherwise an imported record is created, with
    no account. Never creates an account and never sends anything. Closed
    registrations do not block it (RF-F1.10).

    Both inserts use ON CONFLICT, so two taps at the same time cannot create
    two records or two registrations. Returns the registration, the girl and
    whether she was already registered in this action. Does not commit.
    """
    email = normalize_email(data.email)
    await session.execute(
        insert(Girl)
        .values(email=email, name=data.name, study_stage=data.study_stage)
        .on_conflict_do_nothing(index_elements=[Girl.email])
    )
    girl = await session.scalar(
        select(Girl)
        .where(Girl.email == email)
        .execution_options(populate_existing=True)
    )
    assert girl is not None

    inserted = await session.scalar(
        insert(Participation)
        .values(girl_id=girl.id, action_id=action.id)
        .on_conflict_do_nothing(
            index_elements=[Participation.girl_id, Participation.action_id]
        )
        .returning(Participation.id)
    )
    participation = await session.scalar(
        select(Participation)
        .where(Participation.girl_id == girl.id, Participation.action_id == action.id)
        .execution_options(populate_existing=True)
    )
    assert participation is not None
    return participation, girl, inserted is None


async def add_walk_in(
    session: AsyncSession, action: Action, data: WalkInIn, today: date
) -> WalkInOut:
    """ "Veio sem inscrição?" while the attendance is being marked (#346).

    She is registered in the action right away and stays registered even if the
    marks of the page are lost: the page marks her, and only the mark is
    lost. Nothing is sent (RN-27): the e-mails go out when it is concluded.
    """
    action = await lock_action(session, action)
    ensure_awaiting_attendance(action, today)
    participation, girl, already = await register_girl(session, action, data)
    await session.commit()
    return WalkInOut(girl=_girl_out(participation, girl), already_registered=already)


async def conclude_attendance(
    session: AsyncSession,
    action: Action,
    present_ids: list[int],
    today: date,
    now: datetime,
) -> None:
    """ "Concluir presença" (#348, RF-F3.05, RF-F3.07, RF-F4.01, D-81).

    Marks the attendance of the girls in `present_ids` and concludes the
    action, in one commit with the e-mails it causes: the personal invite of
    every registered girl without an account, present or absent, and the
    evaluation of every girl marked as present. The e-mails are only queued
    here; the route sends them right after.

    Concluding again (double tap, reload) changes nothing and queues nothing:
    the action row is locked, so the second request waits for the first and
    then finds it concluded. Only from the day of the event (D-80).
    """
    action = await lock_action(session, action)
    if today < action.starts_on:
        raise TooEarlyError
    if action.attendance_registered_at is not None:
        return

    ids = set(present_ids)
    await ensure_registrations(session, action, ids)

    if ids:
        await session.execute(
            update(Participation)
            .where(Participation.action_id == action.id, Participation.id.in_(ids))
            .values(attended_at=now)
        )
    # The saved marks are done with: what counts from now on is attended_at.
    await session.execute(
        update(Participation)
        .where(Participation.action_id == action.id)
        .values(saved_present=False)
    )
    action.attendance_registered_at = now

    registrations = await registrations_of(session, action.id)
    await queue_attendance_emails(
        session,
        action,
        invite_girl_ids=[girl.id for _, girl in registrations],
        evaluation_girl_ids=[
            girl.id for participation, girl in registrations if participation.id in ids
        ],
    )
    await session.commit()
