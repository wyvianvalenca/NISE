"""The e-mails that the attendance causes (C3, #348 and #350).

RF-F4.01, RF-F4.02, RN-29, RN-32, D-34, D-81, RNF-F4.01.

1. When the coordinator concludes the attendance, `queue_attendance_emails`
   puts in the queue the personal invite of every registered girl without an
   account and the evaluation of every girl marked as present. Marking or
   adding someone after concluding (#350) queues hers.
2. `send_attendance_emails` sends the queue: right away, inside the request
   that caused it (for a few seconds), and again from the scheduled routine
   (`/api/cron/attendance-emails`) for what is left or failed.

The texts are not drawn yet (#333): the ones below are provisional and say only
what the doc already says. Logs carry only counts and the type of the error,
never a name or an address.
"""

import asyncio
import logging
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol
from urllib.parse import quote

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import exists, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.email import EmailNotConfiguredError, SmtpConnection, send_outcome
from app.modules.actions.models import Action, Participation
from app.modules.answers.models import Answer, AnswerStage
from app.modules.attendance.models import AttendanceEmail, AttendanceEmailKind
from app.modules.girls.models import Girl
from app.modules.groups.models import Group, Invite
from app.modules.groups.utils import new_invite_code
from app.users.models import User

logger = logging.getLogger(__name__)

# The personal invite lasts 30 days and is not single-use (RN-32, D-34).
INVITE_DAYS = 30

# Provisional texts, until the e-mails are drawn (#333).
INVITE_SUBJECT = "Seu convite para entrar na NISE"
INVITE_BODY = """Oi!

Você se inscreveu em "{action}", do grupo {group}. O grupo faz parte da NISE, \
que ajuda meninas a descobrir oportunidades em computação.

Crie sua conta pelo seu convite: {link}

O convite vale por {days} dias.

Equipe NISE
"""
EVALUATION_SUBJECT = "Como foi {action}?"
EVALUATION_BODY = """Oi!

Obrigada por ter ido a "{action}", do grupo {group}. Conta pra gente como foi? \
Responder é opcional e leva menos de um minuto.

Avaliar: {link}

Equipe NISE
"""
# The evaluation opens in the app (A03, #58). Its own screen for a girl who
# already has an account comes with the epic C4 (#136).
EVALUATION_PATH = "/cadastro/avaliacao"
INVITE_PATH = "/convite/{code}"

# How many e-mails one call tries to send, and for how long. Inside a request
# the budget is short, so the coordinator does not wait; the scheduled routine
# has more. What is left stays in the queue.
BATCH_SIZE = 50
REQUEST_TIME_BUDGET_SECONDS = 8.0
CRON_TIME_BUDGET_SECONDS = 40.0


class Sender(Protocol):
    """An open connection that sends several e-mails (app.core.email)."""

    def send(self, to: str, subject: str, body: str) -> None: ...

    def close(self) -> None: ...


def is_valid_address(email: str) -> bool:
    """A girl without a valid e-mail is skipped (#348): she gets nothing and is
    not counted. Only the syntax is checked, with no DNS query."""
    try:
        validate_email(email, check_deliverability=False)
    except EmailNotValidError:
        return False
    return True


async def has_account(session: AsyncSession, girl_id: int) -> bool:
    """Her record is linked to an account, or an account with her e-mail exists
    (it is linked when she signs in, RN-29)."""
    girl = await session.get(Girl, girl_id, populate_existing=True)
    if girl is None:
        return False
    if girl.user_id is not None:
        return True
    return bool(await session.scalar(select(exists().where(User.email == girl.email))))


async def girls_without_account(
    session: AsyncSession, girl_ids: Iterable[int]
) -> set[int]:
    """The girls among `girl_ids` who have no account and never got an invite."""
    ids = set(girl_ids)
    if not ids:
        return set()
    rows = await session.scalars(
        select(Girl.id).where(
            Girl.id.in_(ids),
            Girl.user_id.is_(None),
            ~exists().where(User.email == Girl.email),
            ~exists().where(
                AttendanceEmail.girl_id == Girl.id,
                AttendanceEmail.kind == AttendanceEmailKind.INVITE,
            ),
        )
    )
    return set(rows.all())


async def _valid_girls(session: AsyncSession, girl_ids: set[int]) -> set[int]:
    if not girl_ids:
        return set()
    rows = await session.execute(
        select(Girl.id, Girl.email).where(Girl.id.in_(girl_ids))
    )
    return {girl_id for girl_id, email in rows if is_valid_address(email)}


async def queue_attendance_emails(
    session: AsyncSession,
    action: Action,
    invite_girl_ids: Iterable[int],
    evaluation_girl_ids: Iterable[int],
) -> None:
    """Queues the invites and the evaluations. Does not commit.

    `invite_girl_ids` are candidates: only girls with no account, no invite
    ever sent and a valid address get one (RF-F4.02, RN-29). Every girl in
    `evaluation_girl_ids` with a valid address gets the evaluation. ON CONFLICT
    DO NOTHING keeps "never twice" even if two requests queue the same one.
    """
    invites = await _valid_girls(
        session, await girls_without_account(session, invite_girl_ids)
    )
    evaluations = await _valid_girls(session, set(evaluation_girl_ids))
    rows = [
        {"girl_id": girl_id, "action_id": action.id, "kind": AttendanceEmailKind.INVITE}
        for girl_id in sorted(invites)
    ] + [
        {
            "girl_id": girl_id,
            "action_id": action.id,
            "kind": AttendanceEmailKind.EVALUATION,
        }
        for girl_id in sorted(evaluations)
    ]
    if rows:
        await session.execute(
            insert(AttendanceEmail).values(rows).on_conflict_do_nothing()
        )


# --- Sending ------------------------------------------------------------------


def _one_line(text: str) -> str:
    # The name of the action goes in the subject: a line break there would be
    # refused by build_message and drop the e-mail.
    return " ".join(text.split())


def invite_url(code: str) -> str:
    return settings.app_url.rstrip("/") + INVITE_PATH.format(code=quote(code))


def evaluation_url() -> str:
    return settings.app_url.rstrip("/") + EVALUATION_PATH


def invite_message(action: Action, group: Group, code: str) -> tuple[str, str]:
    body = INVITE_BODY.format(
        action=_one_line(action.name),
        group=_one_line(group.name),
        link=invite_url(code),
        days=INVITE_DAYS,
    )
    return INVITE_SUBJECT, body


def evaluation_message(action: Action, group: Group) -> tuple[str, str]:
    subject = EVALUATION_SUBJECT.format(action=_one_line(action.name))
    body = EVALUATION_BODY.format(
        action=_one_line(action.name),
        group=_one_line(group.name),
        link=evaluation_url(),
    )
    return subject, body


@dataclass(frozen=True)
class SendResult:
    sent: int
    dropped: int
    # True if sending stopped on an error; the rest stays for the next time.
    stopped: bool


async def _still_wanted(session: AsyncSession, email: AttendanceEmail) -> bool:
    """Reads again, right before sending, whether this e-mail still makes sense."""
    if email.kind is AttendanceEmailKind.INVITE:
        # She may have created her account in the meantime (RF-F4.02).
        return not await has_account(session, email.girl_id)
    # The evaluation: she is still present and has not rated the action yet.
    present = await session.scalar(
        select(
            exists().where(
                Participation.girl_id == email.girl_id,
                Participation.action_id == email.action_id,
                Participation.attended_at.is_not(None),
            )
        )
    )
    rated = await session.scalar(
        select(
            exists().where(
                Answer.girl_id == email.girl_id,
                Answer.action_id == email.action_id,
                Answer.stage == AnswerStage.RATING,
            )
        )
    )
    return bool(present) and not rated


async def _close(connection: Sender) -> None:
    try:
        await asyncio.to_thread(connection.close)
    except Exception as error:  # noqa: BLE001
        logger.warning("Conexão SMTP não fechou: %s", type(error).__name__)


async def send_attendance_emails(
    session: AsyncSession,
    action_id: int | None = None,
    connect: Callable[[], Sender] = SmtpConnection,
    now: datetime | None = None,
    clock: Callable[[], float] = time.monotonic,
    time_budget: float = CRON_TIME_BUDGET_SECONDS,
) -> SendResult:
    """Sends the queue (of one action, or all of it) over a single connection.

    The same pattern as the e-mails of the official lists (#275): each e-mail
    is locked (FOR UPDATE SKIP LOCKED) and marked as sent in a commit before it
    leaves, so two routines never take the same one and a routine cut in the
    middle never sends it again (RNF-F4.01). An invite gets its personal link
    in that same commit, valid for 30 days from the sending. If sending fails
    without leaving, the mark is undone (or the e-mail is dropped, if the
    problem is its own) and the attendance stays concluded (D-81).
    """
    if now is None:
        now = datetime.now(UTC)
    started = clock()

    pending = (AttendanceEmail.sent_at.is_(None), AttendanceEmail.dropped_at.is_(None))
    query = select(AttendanceEmail.id).where(*pending)
    if action_id is not None:
        query = query.where(AttendanceEmail.action_id == action_id)
    ids = (
        await session.scalars(query.order_by(AttendanceEmail.id).limit(BATCH_SIZE))
    ).all()
    if not ids:
        return SendResult(sent=0, dropped=0, stopped=False)

    try:
        connection = await asyncio.to_thread(connect)
    except Exception as error:  # noqa: BLE001
        # Not configured, wrong password, server down: everything stays queued.
        # The message may carry the address: only the type goes to the log.
        # Commit, not rollback: a rollback would expire what the caller still
        # reads from this session (the page answered right after).
        await session.commit()
        if not isinstance(error, EmailNotConfiguredError):
            logger.warning(
                "Envio dos e-mails da presença parou: %s", type(error).__name__
            )
        return SendResult(sent=0, dropped=0, stopped=True)

    sent = dropped = 0
    stopped = False
    try:
        for email_id in ids:
            if clock() - started >= time_budget:
                break

            email = await session.scalar(
                select(AttendanceEmail)
                .where(AttendanceEmail.id == email_id, *pending)
                .with_for_update(skip_locked=True)
            )
            if email is None:
                continue  # another routine took or settled it

            girl = await session.get(Girl, email.girl_id, populate_existing=True)
            action = await session.get(Action, email.action_id)
            group = await session.get(Group, action.group_id) if action else None
            if (
                girl is None
                or action is None
                or group is None
                or not await _still_wanted(session, email)
            ):
                email.dropped_at = now
                await session.commit()
                dropped += 1
                continue

            address = girl.email
            if email.kind is AttendanceEmailKind.INVITE:
                code = new_invite_code()
                session.add(
                    Invite(
                        code=code,
                        group_id=group.id,
                        girl_id=girl.id,
                        expires_at=now + timedelta(days=INVITE_DAYS),
                    )
                )
                subject, body = invite_message(action, group, code)
            else:
                subject, body = evaluation_message(action, group)

            # Marked before sending: at most once.
            email.sent_at = now
            await session.commit()

            try:
                await asyncio.to_thread(connection.send, address, subject, body)
            except Exception as error:  # noqa: BLE001
                outcome = send_outcome(error)
                logger.warning(
                    "E-mail da presença não enviado (%s): %s",
                    outcome,
                    type(error).__name__,
                )
                if outcome == "drop":
                    email.sent_at = None
                    email.dropped_at = now
                    await session.commit()
                    dropped += 1
                    continue
                if outcome == "retry":
                    # The invite link created above stays unused and expires.
                    email.sent_at = None
                    await session.commit()
                stopped = True
                break

            sent += 1
    finally:
        await _close(connection)

    logger.info("E-mails da presença: %s enviados, %s descartados", sent, dropped)
    return SendResult(sent=sent, dropped=dropped, stopped=stopped)
