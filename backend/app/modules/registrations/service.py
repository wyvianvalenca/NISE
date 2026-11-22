"""Registering a girl in an action by her e-mail (C2, #232).

Every route of C2 (manual sign-up, import) goes through `register_girl`, so they
all behave the same way. Nothing here logs or returns a girl's data.
"""

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.actions.models import Action, Participation
from app.modules.girls.models import Girl, StudyStage
from app.modules.registrations.exceptions import (
    ActionNotInGroupError,
    EventDayReachedError,
)
from app.users.service import normalize_email


@dataclass(frozen=True)
class RegistrationData:
    name: str
    email: str
    whatsapp: str | None = None
    study_stage: StudyStage | None = None
    school_year: str | None = None


@dataclass(frozen=True)
class RegistrationResult:
    participation: Participation
    girl: Girl
    record_existed: bool  # the e-mail already had a record (any group, any account)
    already_registered: bool  # she was already in this action; nothing changed


def _plain(text: str) -> str:
    """Lower case, no accents, single spaces."""
    decomposed = unicodedata.normalize("NFKD", text)
    letters = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(letters.lower().split())


# Keywords of a free-text level, checked in order (first match wins; "pos-graduacao" is
# a graduate, so FORMADA comes before GRADUACAO).
_STAGE_KEYWORDS: list[tuple[StudyStage, tuple[str, ...]]] = [
    (StudyStage.FUNDAMENTAL, ("fundamental",)),
    (StudyStage.MEDIO, ("medio",)),
    (StudyStage.TECNICO, ("tecnic",)),
    (StudyStage.FORMADA, ("formad", "ja me formei", "pos")),
    (StudyStage.GRADUACAO, ("graduac", "superior", "faculdade", "universi")),
]


def parse_study_stage(text: str | None) -> StudyStage | None:
    """Free text of a spreadsheet to a stage of the girl's sign-up (RF-F1.04)."""
    if text is None:
        return None
    plain = _plain(text)
    if not plain:
        return None
    for stage in StudyStage:
        if plain == stage.value:
            return stage
    for stage, keywords in _STAGE_KEYWORDS:
        if any(keyword in plain for keyword in keywords):
            return stage
    return None


# Rules of the school year, checked in order. A year only fills the stage.
_YEAR_RULES: list[tuple[re.Pattern[str], StudyStage]] = [
    (re.compile(r"tecnic|modulo"), StudyStage.TECNICO),
    (re.compile(r"periodo|semestre"), StudyStage.GRADUACAO),
    (re.compile(r"\bserie\b|\bem\b|medio"), StudyStage.MEDIO),
    (re.compile(r"\b[1-9]\s*(o|a)?\s*ano\b|\bano\b"), StudyStage.FUNDAMENTAL),
]


def infer_study_stage(
    study_stage: StudyStage | None, school_year: str | None
) -> StudyStage | None:
    """The level wins; the school year only fills it when empty (#232)."""
    if study_stage is not None:
        return study_stage
    if school_year is None:
        return None
    plain = _plain(school_year.replace("º", "o").replace("ª", "a"))
    for pattern, stage in _YEAR_RULES:
        if pattern.search(plain):
            return stage
    return None


def registrations_are_open(action: Action, today: date) -> bool:
    """They close by themselves on the day of the event (RF-F1.16)."""
    return action.registrations_open and today < action.starts_on


def can_reopen(action: Action, today: date) -> bool:
    return not action.registrations_open and today < action.starts_on


async def close_registrations(session: AsyncSession, action: Action) -> None:
    """The coordinator closes the sign-ups (RF-F1.10, RN-37).

    The action leaves Descobrir and Ver depois through `registrations_open`
    (`action_is_visible`, RN-16) and stays in the filé of whoever had it (RN-36).
    The status is computed, so nothing else changes. Idempotent.
    """
    if action.registrations_open:
        action.registrations_open = False
        await session.commit()


async def reopen_registrations(
    session: AsyncSession, action: Action, today: date
) -> None:
    """The coordinator reopens the sign-ups, until the day of the event (RF-F1.13).

    From that day they close by themselves (RF-F1.16), so the server refuses it
    even for a request that skips the screen. The action goes back to the
    suggestions through `registrations_open` (RN-16); the status stays (RN-37).
    Idempotent while the event is ahead.
    """
    if today >= action.starts_on:
        raise EventDayReachedError
    if not action.registrations_open:
        action.registrations_open = True
        await session.commit()


async def register_girl(
    session: AsyncSession,
    action: Action,
    group_ids: Sequence[int],
    data: RegistrationData,
) -> RegistrationResult:
    """Puts a girl in an action of the group from her e-mail (RN-29, RN-27).

    The e-mail is compared ignoring case and spaces. A record that already
    exists (with or without an account, from any group) is linked and never
    changed; otherwise an imported record is created, with no account. Never
    creates an account and never sends anything. Closed registrations do not
    block it (RF-F1.10).

    Both inserts use ON CONFLICT, so two requests at the same time cannot make
    two records or two registrations. Does not commit: the caller does.
    """
    if action.group_id not in group_ids:
        raise ActionNotInGroupError

    email = normalize_email(data.email)
    study_stage = infer_study_stage(data.study_stage, data.school_year)

    created_girl = await session.scalar(
        insert(Girl)
        .values(email=email, name=data.name, study_stage=study_stage)
        .on_conflict_do_nothing(index_elements=[Girl.email])
        .returning(Girl.id)
    )
    girl = await session.scalar(
        select(Girl)
        .where(Girl.email == email)
        .execution_options(populate_existing=True)
    )
    assert girl is not None

    inserted = await session.scalar(
        insert(Participation)
        .values(
            girl_id=girl.id,
            action_id=action.id,
            name=data.name,
            whatsapp=data.whatsapp,
            study_stage=study_stage,
            school_year=data.school_year,
        )
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
    return RegistrationResult(
        participation=participation,
        girl=girl,
        record_existed=created_girl is None,
        already_registered=inserted is None,
    )


# The optional fields, in the order of the columns of the page (RF-F1.14).
OPTIONAL_COLUMNS = ("whatsapp", "study_stage", "school_year")


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_registrations(
    session: AsyncSession, action: Action, search: str | None, offset: int, limit: int
) -> tuple[list[tuple[Participation, str, str]], int]:
    """The girls of the action, by shown name, with the total of the matches.

    The shown name is the one this registration gave, falling back to the record
    (never another group's typing, RN-01). The search is a case-insensitive
    "contains" on that name or on the e-mail. Returns rows of
    (participation, shown name, e-mail).
    """
    shown_name = func.coalesce(Participation.name, Girl.name)
    conditions = [Participation.action_id == action.id]
    term = search.strip() if search else ""
    if term:
        pattern = f"%{_escape_like(term)}%"
        conditions.append(
            or_(
                shown_name.ilike(pattern, escape="\\"),
                Girl.email.ilike(pattern, escape="\\"),
            )
        )

    base = select(Participation, shown_name, Girl.email).join(
        Girl, Girl.id == Participation.girl_id
    )
    total = await session.scalar(
        select(func.count())
        .select_from(Participation)
        .join(Girl, Girl.id == Participation.girl_id)
        .where(*conditions)
    )
    rows = await session.execute(
        base.where(*conditions)
        .order_by(shown_name, Participation.id)
        .offset(offset)
        .limit(limit)
    )

    return [(p, n, e) for p, n, e in rows.all()], total or 0


async def registration_columns(session: AsyncSession, action: Action) -> list[str]:
    """The optional fields with data in any registration of the action."""
    row = (
        await session.execute(
            select(
                func.bool_or(Participation.whatsapp.is_not(None)),
                func.bool_or(Participation.study_stage.is_not(None)),
                func.bool_or(Participation.school_year.is_not(None)),
            ).where(Participation.action_id == action.id)
        )
    ).one()

    return [name for name, has in zip(OPTIONAL_COLUMNS, row, strict=True) if has]


async def email_check(
    session: AsyncSession, action: Action, group_ids: Sequence[int], email: str
) -> tuple[bool, list[Action]]:
    """Whether the e-mail has a record, and up to 3 other actions of the coordinator's
    groups where she is registered, newest first (RF-F1.17).

    Only actions of the coordinator's own groups are ever returned: that another
    group's action exists, or that she went to it, stays hidden (RN-01, RN-04).
    """
    normalized = normalize_email(email)
    girl_id = await session.scalar(select(Girl.id).where(Girl.email == normalized))
    if girl_id is None:
        return False, []

    actions = await session.scalars(
        select(Action)
        .join(Participation, Participation.action_id == Action.id)
        .where(
            Participation.girl_id == girl_id,
            Action.group_id.in_(group_ids),
            Action.id != action.id,
        )
        .order_by(Action.starts_on.desc(), Action.id.desc())
        .limit(3)
    )
    return True, list(actions.all())
