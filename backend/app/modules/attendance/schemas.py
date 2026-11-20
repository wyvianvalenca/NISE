from datetime import date, time
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints

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
    # Marked with "Salvar e continuar depois" (#340). Not attendance (D-81).
    saved_present: bool


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
    # How many girls are marked in the saved marks (#340), for "14 de 23".
    saved_count: int
    # Day of the most recent registration, for "23 importadas em 16/10".
    last_registered_on: date | None
    # Optional columns that have data in at least one girl (RF-F1.14).
    columns: list[str]
    girls: list[AttendanceGirlOut]


# More than any action will have; it only bounds the size of the request.
MAX_MARKS = 5000


class SavedMarksIn(BaseModel):
    """ "Salvar e continuar depois" (#340): the registrations marked as present.

    It replaces what was saved before, so a girl left out is unmarked.
    """

    present_ids: Annotated[list[int], Field(max_length=MAX_MARKS)]


NAME_MAX_LENGTH = 200


class WalkInIn(BaseModel):
    """ "Veio sem inscrição? Adicionar participante" (#346, RF-F3.03, RF-F1.09).

    Name and e-mail are required; the study level is optional. WhatsApp and
    "Série" come with the registration of C2 (#232, #235).
    """

    name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=NAME_MAX_LENGTH
        ),
    ]
    email: EmailStr
    study_stage: StudyStage | None = None


class WalkInOut(BaseModel):
    """The girl as she now is in the action's list.

    `already_registered` says that the e-mail was already registered in this
    action: nobody was duplicated (#346).
    """

    girl: AttendanceGirlOut
    already_registered: bool
