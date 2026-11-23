from datetime import date, time
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.modules.actions.models import (
    DESCRIPTION_MAX_LENGTH,
    ActionFormat,
    ActionStatus,
    ActionType,
    ActionVisibility,
)
from app.modules.girls.models import StudyStage, Topic

NAME_MAX_LENGTH = 200
URL_MAX_LENGTH = 2048
ADDRESS_MAX_LENGTH = 300


def _without_repeats[T](items: list[T]) -> list[T]:
    # The same value twice counts once, in the order she chose it.
    return list(dict.fromkeys(items))


def _blank_to_none(value: str | None) -> str | None:
    # An empty optional field from the form means "not filled in".
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


# Stripped, length-checked, and an empty string becomes None. The length is
# checked on the text, so a null is allowed through.
OptionalUrl = Annotated[
    Annotated[str, StringConstraints(strip_whitespace=True, max_length=URL_MAX_LENGTH)]
    | None,
    AfterValidator(_blank_to_none),
]
OptionalAddress = Annotated[
    Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=ADDRESS_MAX_LENGTH)
    ]
    | None,
    AfterValidator(_blank_to_none),
]
OptionalDescription = Annotated[
    Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=DESCRIPTION_MAX_LENGTH)
    ]
    | None,
    AfterValidator(_blank_to_none),
]


class ActionIn(BaseModel):
    """What the form sends to create or edit an action (RF-F30.01, RF-F30.03).

    There is no group here on purpose: the group is always the signed-in
    coordinator's, and a `group_id` sent anyway is ignored (RN-14). The rules that
    need more than one field or the database live in
    `service.validate_action_data`, which the creation and the edit share.
    """

    model_config = ConfigDict(extra="ignore")

    name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=NAME_MAX_LENGTH
        ),
    ]
    type: ActionType
    starts_on: date
    # Left out when the action lasts one day only: it then ends on `starts_on`.
    ends_on: date | None = None
    format: ActionFormat
    # IBGE code of the city (RN-17), as the cities route serves it.
    city_ibge_code: int | None = None
    visibility: ActionVisibility
    registration_url: OptionalUrl = None
    starts_at_time: time | None = None
    ends_at_time: time | None = None
    address: OptionalAddress = None
    description: OptionalDescription = None
    # Tags are the 8 topics (D-44); an empty list is allowed (RF-F17.06).
    topics: Annotated[
        list[Topic], Field(max_length=len(Topic)), AfterValidator(_without_repeats)
    ] = []
    audiences: Annotated[
        list[StudyStage],
        Field(max_length=len(StudyStage)),
        AfterValidator(_without_repeats),
    ] = []


class ActionOut(BaseModel):
    """A saved action, as the form and the list read it.

    `city_label` is "Maceió, AL", the text of the notice "Já aparece nas
    sugestões das meninas de <cidade>"; it is null for an online action (D-45).
    """

    id: int
    name: str
    type: ActionType
    starts_on: date
    ends_on: date
    format: ActionFormat
    city_ibge_code: int | None
    city_label: str | None
    visibility: ActionVisibility
    registration_url: str | None
    starts_at_time: time | None
    ends_at_time: time | None
    address: str | None
    description: str | None
    registrations_open: bool
    topics: list[Topic]
    audiences: list[StudyStage]
    status: ActionStatus


class ActionPageOut(ActionOut):
    """The action page (K11, #233): the action plus what the page needs to decide.

    `registrations_open` here is the effective value (RF-F1.16): closed by the
    coordinator or by the day of the event arriving. `today` comes from the server
    so the screen and the rules agree on the date (Maceió).
    """

    city_name: str | None
    created_on: date
    today: date
    registered_count: int
    registrations_closed_by_coordinator: bool
    can_reopen: bool
    # False once the attendance is saved (RF-F30.12).
    can_delete: bool


class ActionListItemOut(BaseModel):
    """One row of the "Ações" list (K10, RF-F30.10).

    `attended_count` is null while there is no attendance to count (RN-37), so the
    row can tell "22 de 30 presentes" from "26 inscritas".
    """

    id: int
    name: str
    type: ActionType
    starts_on: date
    ends_on: date
    format: ActionFormat
    city_label: str | None
    visibility: ActionVisibility
    registrations_open: bool
    status: ActionStatus
    registered_count: int
    attended_count: int | None


class ActionStatusCountsOut(BaseModel):
    """The numbers on the filter chips: "Todas 10", "Aguardando inscrições 3"..."""

    all: int
    awaiting_registrations: int
    awaiting_event: int
    awaiting_attendance: int
    concluded: int


class ActionListOut(BaseModel):
    """The actions of the group that pass the filters, and the chip counts."""

    items: list[ActionListItemOut]
    counts: ActionStatusCountsOut
