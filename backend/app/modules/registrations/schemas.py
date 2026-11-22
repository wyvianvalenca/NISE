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
