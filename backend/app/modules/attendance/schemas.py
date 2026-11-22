from datetime import date, time
from typing import Annotated

from pydantic import BaseModel, Field

from app.modules.actions.models import (
    ActionFormat,
    ActionStatus,
    ActionType,
    ActionVisibility,
)
from app.modules.girls.models import StudyStage
from app.modules.registrations.schemas import RegistrationIn


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
    # The optional fields of the registration (C2, #232), as the list of
    # "Inscritas" has them.
    whatsapp: str | None
    study_stage: StudyStage | None
    school_year: str | None
    # Marked with "Salvar e continuar depois" (#340). Not attendance (D-81).
    saved_present: bool
    # Present: marked when the attendance was concluded, or afterwards (#348).
    present: bool


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
    # The day "Concluir presença" was tapped, in Maceió time ("registrada em
    # 24/10"), and how many were present. Null and 0 before that.
    concluded_on: date | None
    present_count: int
    # Before concluding: how many invites concluding would send, for the
    # confirmation (RF-F3.11). Registered girls with no account, no invite
    # ever and a valid e-mail; present or absent.
    invites_to_send: int
    # After concluding: the invites and evaluations of this action, sent or
    # waiting to go out, for the card "Depois da ação" (RF-F3.10, D-81).
    # Dropped ones (address refused, she created her account) do not count.
    invites_sent: int
    evaluations_sent: int
    # Optional columns ("whatsapp", "study_stage", "school_year") that have data in
    # at least one girl (RF-F1.14).
    columns: list[str]
    girls: list[AttendanceGirlOut]


# More than any action will have; it only bounds the size of the request.
MAX_MARKS = 5000


class SavedMarksIn(BaseModel):
    """ "Salvar e continuar depois" (#340): the registrations marked as present.

    It replaces what was saved before, so a girl left out is unmarked.
    """

    present_ids: Annotated[list[int], Field(max_length=MAX_MARKS)]


class WalkInIn(RegistrationIn):
    """ "Veio sem inscrição? Adicionar participante" (#346, RF-F3.03, RF-F1.09).

    The same fields and validation as "Adicionar inscrita" of C2 (#235): name and
    e-mail are required; WhatsApp, study level and school year are optional.
    """


class WalkInOut(BaseModel):
    """The girl as she now is in the action's list.

    `already_registered` says that the e-mail was already registered in this
    action: nobody was duplicated (#346).
    """

    girl: AttendanceGirlOut
    already_registered: bool


class ConcludeIn(BaseModel):
    """ "Concluir presença" (#348): the registrations marked as present."""

    present_ids: Annotated[list[int], Field(max_length=MAX_MARKS)]


# The same limit as the import of the registered girls (C2, #234).
MAX_IMPORT_LINES = 2000


class ImportedListIn(BaseModel):
    """ "Importar lista de presença" (#349, RF-F3.02): the e-mail of each line.

    The page reads the spreadsheet and sends only the cell of the e-mail column.
    The server never receives or keeps the file.
    """

    emails: Annotated[list[str], Field(max_length=MAX_IMPORT_LINES)]


class ImportedListOut(BaseModel):
    """Who the list marks. Nothing was saved: the page marks them (RF-F3.04).

    `present_ids` are the registrations whose e-mail is in the list, once each.
    `not_found_count` is the lines that match no registration (or have no
    e-mail), only counted: which ones are not told (RN-27).
    """

    present_ids: list[int]
    line_count: int
    not_found_count: int
