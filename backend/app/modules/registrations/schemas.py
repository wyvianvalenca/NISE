from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, EmailStr, StringConstraints

from app.modules.girls.models import StudyStage


class RegistrationOut(BaseModel):
    """One girl in an action. `id` is the registration's, not the record's."""

    id: int
    name: str
    email: str
    whatsapp: str | None
    study_stage: StudyStage | None
    school_year: str | None


class RegistrationListOut(BaseModel):
    """A page of the girls, the matches in `total`, and the columns with data."""

    items: list[RegistrationOut]
    total: int
    columns: list[Literal["whatsapp", "study_stage", "school_year"]]


# --- import of a spreadsheet (#234) ---


class MappingBody(BaseModel):
    """Column of the file for each field of the NISE; null = "Não usar"."""

    name: str | None = None
    email: str | None = None
    whatsapp: str | None = None
    study_stage: str | None = None
    school_year: str | None = None


class ImportReadOut(BaseModel):
    file_name: str
    line_count: int
    columns: list[str]
    first_line: dict[str, str]
    suggested: MappingBody


class ImportRowOut(BaseModel):
    line: int
    name: str
    email: str
    whatsapp: str | None
    study_stage: StudyStage | None
    school_year: str | None


class ImportReviewRowOut(BaseModel):
    line: int
    name: str
    email: str
    reason: Literal["incomplete_email", "missing_email", "missing_name"]


class ImportRepeatedOut(BaseModel):
    name: str
    email: str
    count: int


class ImportReviewOut(BaseModel):
    file_name: str
    line_count: int
    ready: list[ImportRowOut]
    to_review: list[ImportReviewRowOut]
    repeated: list[ImportRepeatedOut]
    already_in_action: int
    new_count: int


class CorrectionBody(BaseModel):
    line: int
    email: str


class ImportOut(BaseModel):
    imported: int
    already_in_action: int
    registered_count: int


def _blank_to_none(value: object) -> object:
    """A field she left empty or with only spaces is the same as not given."""
    if isinstance(value, str):
        return value.strip() or None
    return value


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


class RegistrationIn(BaseModel):
    """Add a girl by hand (RF-F1.09): name and e-mail required, the rest optional."""

    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]
    email: Annotated[EmailStr, BeforeValidator(_strip)]
    whatsapp: Annotated[
        Annotated[str, StringConstraints(max_length=40)] | None,
        BeforeValidator(_blank_to_none),
    ] = None
    study_stage: StudyStage | None = None
    school_year: Annotated[
        Annotated[str, StringConstraints(max_length=40)] | None,
        BeforeValidator(_blank_to_none),
    ] = None


class RegistrationAddedOut(BaseModel):
    registration: RegistrationOut
    already_registered: bool  # she was already in this action; nothing changed
    record_existed: bool  # her e-mail already had a record in the NISE


class GroupActionOut(BaseModel):
    name: str
    starts_on: date


class EmailCheckOut(BaseModel):
    """Whether the e-mail is in the NISE, and which actions of the group she took part in."""

    exists: bool
    group_actions: list[GroupActionOut]
