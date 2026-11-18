import enum
from datetime import datetime
from typing import Self

from pydantic import BaseModel, model_validator

from app.modules.admissions.models import CourseLevel


class MatchOut(BaseModel):
    """O card da lista oficial na A19 (RF-F31.04).

    Só para a própria menina. `name` é o nome dela na conta, que é o que a busca
    achou igual na lista; nenhum outro nome da lista existe no sistema.
    """

    id: int
    name: str
    institution: str
    selection_process: str
    call: str
    course: str
    level: CourseLevel
    list_url: str | None
    expires_at: datetime


class MatchAnswerIn(BaseModel):
    """ "Sou eu" / "Não sou eu" e, se for ela, "Já me matriculei" / "Ainda não"."""

    is_me: bool
    # Obrigatório com "Sou eu"; ignorado com "Não sou eu".
    enrolled: bool | None = None

    @model_validator(mode="after")
    def enrolled_answered_when_it_is_her(self) -> Self:
        if self.is_me and self.enrolled is None:
            raise ValueError("Com 'Sou eu', diga se já se matriculou")
        return self


class MatchResult(enum.Enum):
    ENROLLED = "enrolled"
    APPROVED = "approved"
    DISMISSED = "dismissed"


class MatchAnswerOut(BaseModel):
    result: MatchResult
