import enum
from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.modules.admissions.models import AdmissionOrigin, CourseLevel


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


class EnrollmentRowOut(BaseModel):
    """Uma linha de "Quem ingressou" (#315). O front lê em camelCase.

    Só o que a tela mostra: o nome vem curto ("Ana L."), e não vão e-mail,
    nascimento nem a chamada da lista oficial.
    """

    # Id do ingresso, para a chave da linha no front.
    id: int
    girl_name: str = Field(serialization_alias="girlName")
    course: str
    # O que ela escreveu em "Onde?" ou a instituição da lista. Vazio é null, e
    # a tela mostra "—".
    institution: str | None
    # Quando o ingresso foi registrado, não o semestre em que ela entrou (D-73).
    registered_at: datetime = Field(serialization_alias="registeredAt")
    # "Ela declarou na NISE" ou "Detectada na busca" (RF-F6.03).
    origin: AdmissionOrigin


class EnrollmentPageOut(BaseModel):
    """Uma página da lista e o que a paginação precisa (D-77)."""

    items: list[EnrollmentRowOut]
    # Quantas meninas a lista tem ao todo, o número ao lado do título.
    total: int
    page: int
    page_size: int = Field(serialization_alias="pageSize")


class ListSearchOut(BaseModel):
    """O card "Busca nas listas de ingressantes" (#317, RF-F5.23).

    Só fontes e datas, iguais para todas as coordenadoras: a busca não é por
    grupo. Nenhum nome, número de achadas ou lista de quem foi achada (RN-24).
    """

    # As fontes que a busca lê, como no chip: "UFAL" e, quando o #274 entrar,
    # "IFAL".
    sources: list[str]
    # Quando a última rodada terminou bem. Null se nunca rodou.
    last_search_at: datetime | None = Field(serialization_alias="lastSearchAt")
    # Dia previsto da próxima (D-72). Null se nunca rodou.
    next_search_on: date | None = Field(serialization_alias="nextSearchOn")
