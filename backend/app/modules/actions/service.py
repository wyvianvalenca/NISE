from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.modules.actions.models import Action, ActionStatus

# "The day of the event has come" is decided in Maceió time, as in the age rule
# (RN-03), so an action does not change status at 21:00 local time because the
# server runs in UTC.
ACTION_TIMEZONE = ZoneInfo("America/Maceio")


def today_in_maceio(now: datetime | None = None) -> date:
    """Today's date in `ACTION_TIMEZONE`; `now` is a parameter so tests can fix it."""
    current = now if now is not None else datetime.now(UTC)
    return current.astimezone(ACTION_TIMEZONE).date()


def compute_status(action: Action, registered_count: int, today: date) -> ActionStatus:
    """The status of an action, by the first rule that applies (RN-37).

    It is pure on purpose: the registered count and "today" come as arguments, so
    every route uses this one function and the rules are tested without a
    database. The day that counts is `starts_on`, also for actions of several days.

    Whether registrations are open does not enter here: it is a separate matter
    and closing them never changes the status.
    """
    event_day_has_come = today >= action.starts_on

    if event_day_has_come and action.attendance_registered_at is not None:
        return ActionStatus.CONCLUDED
    if event_day_has_come:
        return ActionStatus.AWAITING_ATTENDANCE
    if registered_count == 0:
        return ActionStatus.AWAITING_REGISTRATIONS
    return ActionStatus.AWAITING_EVENT
