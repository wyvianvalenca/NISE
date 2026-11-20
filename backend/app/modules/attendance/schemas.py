from datetime import date, time

from pydantic import BaseModel

from app.modules.actions.models import (
    ActionFormat,
    ActionStatus,
    ActionType,
    ActionVisibility,
)
from app.modules.girls.models import StudyStage


class AttendanceActionOut(BaseModel):
    """The header of the action page (K11): what the other versions also show."""

    id: int
    name: str
    type: ActionType
    starts_on: date
    ends_on: date
    starts_at_time: time | None
    ends_at_time: time | None
    format: ActionFormat
    # Only the city name, as in "Presencial · Maceió". Null for an online action.
    city_name: str | None
    visibility: ActionVisibility
    # The day the action was saved, for the step "Cadastro · Feito em 16/10".
    created_on: date


class AttendanceGirlOut(BaseModel):
    """One registered girl of the action, as the lists of the page show her.

    `id` is the registration (the participation), never the girl's record: the
    page only needs to tell the rows apart.
    """

    id: int
    name: str
    email: str
    study_stage: StudyStage | None


class AttendancePageOut(BaseModel):
    """Everything the action page needs around the attendance (C3, #135).

    `today` is the date in Maceió time, the same the status uses (RN-37), so the
    page never decides "the day of the event has come" with the browser's clock.
    """

    action: AttendanceActionOut
    status: ActionStatus
    today: date
    # Registrations close by themselves on the day of the event (RF-F1.16).
    registrations_open: bool
    # Deleting is possible until the attendance is concluded (RN-15).
    can_delete: bool
    registered_count: int
    # Day of the most recent registration, for "23 importadas em 16/10".
    last_registered_on: date | None
    # Optional columns that have data in at least one girl (RF-F1.14).
    columns: list[str]
    girls: list[AttendanceGirlOut]
