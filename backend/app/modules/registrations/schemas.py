from typing import Literal

from pydantic import BaseModel

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
