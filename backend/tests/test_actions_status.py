"""Computed status of an action (RN-37, #208). Pure function: no session."""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionStatus,
    ActionType,
    ActionVisibility,
)
from app.modules.actions.service import compute_status, today_in_maceio

TODAY = date(2026, 11, 18)
TOMORROW = TODAY + timedelta(days=1)
YESTERDAY = TODAY - timedelta(days=1)
ATTENDANCE_SAVED = datetime(2026, 11, 17, 15, 0, tzinfo=UTC)


def make_action(
    starts_on: date,
    *,
    ends_on: date | None = None,
    attendance_saved: bool = False,
    registrations_open: bool = True,
) -> Action:
    return Action(
        group_id=1,
        name="Oficina de robotica",
        type=ActionType.OFICINA,
        starts_on=starts_on,
        ends_on=ends_on or starts_on,
        format=ActionFormat.ONLINE,
        visibility=ActionVisibility.CLOSED,
        registrations_open=registrations_open,
        attendance_registered_at=ATTENDANCE_SAVED if attendance_saved else None,
    )


def test_future_action_without_registered_girls_awaits_registrations() -> None:
    action = make_action(TOMORROW)

    assert compute_status(action, 0, TODAY) is ActionStatus.AWAITING_REGISTRATIONS


def test_future_action_with_registered_girls_awaits_the_event() -> None:
    action = make_action(TOMORROW)

    assert compute_status(action, 3, TODAY) is ActionStatus.AWAITING_EVENT


@pytest.mark.parametrize("registered", [0, 5], ids=["no-girls", "with-girls"])
def test_on_the_day_itself_without_attendance_awaits_attendance(
    registered: int,
) -> None:
    action = make_action(TODAY)

    assert compute_status(action, registered, TODAY) is ActionStatus.AWAITING_ATTENDANCE


def test_past_action_without_attendance_awaits_attendance() -> None:
    action = make_action(YESTERDAY)

    assert compute_status(action, 4, TODAY) is ActionStatus.AWAITING_ATTENDANCE


def test_on_the_day_itself_with_attendance_is_concluded() -> None:
    action = make_action(TODAY, attendance_saved=True)

    assert compute_status(action, 4, TODAY) is ActionStatus.CONCLUDED


def test_past_action_with_attendance_is_concluded_even_if_nobody_came() -> None:
    action = make_action(YESTERDAY, attendance_saved=True)

    assert compute_status(action, 0, TODAY) is ActionStatus.CONCLUDED


@pytest.mark.parametrize("registered", [0, 4], ids=["no-girls", "with-girls"])
def test_attendance_saved_before_the_day_does_not_conclude_the_action(
    registered: int,
) -> None:
    action = make_action(TOMORROW, attendance_saved=True)

    expected = (
        ActionStatus.AWAITING_EVENT
        if registered
        else ActionStatus.AWAITING_REGISTRATIONS
    )
    assert compute_status(action, registered, TODAY) is expected


def test_multi_day_action_counts_from_its_first_day() -> None:
    action = make_action(YESTERDAY, ends_on=TOMORROW)

    assert compute_status(action, 4, TODAY) is ActionStatus.AWAITING_ATTENDANCE


def test_multi_day_action_not_started_yet_is_still_waiting_for_the_event() -> None:
    action = make_action(TOMORROW, ends_on=TOMORROW + timedelta(days=2))

    assert compute_status(action, 4, TODAY) is ActionStatus.AWAITING_EVENT


@pytest.mark.parametrize(
    ("starts_on", "registered"),
    [(TOMORROW, 0), (TOMORROW, 3), (TODAY, 3)],
)
def test_closing_registrations_never_changes_the_status(
    starts_on: date, registered: int
) -> None:
    open_action = make_action(starts_on, registrations_open=True)
    closed_action = make_action(starts_on, registrations_open=False)

    assert compute_status(closed_action, registered, TODAY) is compute_status(
        open_action, registered, TODAY
    )


def test_status_values_are_the_ones_the_front_expects() -> None:
    assert {status.value for status in ActionStatus} == {
        "awaiting_registrations",
        "awaiting_event",
        "awaiting_attendance",
        "concluded",
    }


def test_today_is_the_date_in_maceio_not_in_utc() -> None:
    # 01:00 UTC on the 18th is still 22:00 on the 17th in Maceió (UTC-3).
    assert today_in_maceio(datetime(2026, 11, 18, 1, 0, tzinfo=UTC)) == date(
        2026, 11, 17
    )
    assert today_in_maceio(datetime(2026, 11, 18, 3, 0, tzinfo=UTC)) == date(
        2026, 11, 18
    )
