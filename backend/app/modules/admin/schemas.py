import enum
from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    EmailStr,
    StringConstraints,
    model_validator,
)


class CoordinatorStatus(enum.Enum):
    ACTIVE = "active"
    INVITE_SENT = "invite_sent"
    INVITE_EXPIRED = "invite_expired"
    DEACTIVATED = "deactivated"


class CoordinatorFilter(enum.Enum):
    ALL = "all"
    ACTIVE = "active"
    INVITES = "invites"
    DEACTIVATED = "deactivated"


class CoordinatorRowOut(BaseModel):
    # Ativa e desativada trazem o id da usuária; os convites, o id do convite.
    # O front usa `status` junto com o id.
    id: int
    name: str
    group_name: str
    status: CoordinatorStatus
    # Ativa: quando entrou. Convite enviado: quando vence. Convite expirou:
    # quando venceu. Desativada: desde quando.
    date: datetime


class CoordinatorCountsOut(BaseModel):
    all: int
    active: int
    invites: int
    deactivated: int


def _one_line(value: str) -> str:
    # Sem quebra de linha: o nome do grupo vai no assunto do e-mail.
    return " ".join(value.split())


OneLine = Annotated[
    str, BeforeValidator(_one_line), StringConstraints(min_length=1, max_length=100)
]


class NewGroupIn(BaseModel):
    name: OneLine
    city_id: int


class CoordinatorInviteIn(BaseModel):
    """O painel "Convidar coordenadora" (AD03): ela e um grupo, novo ou não."""

    name: OneLine
    email: EmailStr
    # Um dos dois: o grupo que já existe, ou o grupo novo criado com o convite.
    group_id: int | None = None
    new_group: NewGroupIn | None = None

    @model_validator(mode="after")
    def exactly_one_group(self) -> Self:
        if (self.group_id is None) == (self.new_group is None):
            raise ValueError("Informe group_id ou new_group, só um dos dois")
        return self


class CoordinatorInviteOut(BaseModel):
    """O painel "Convite enviado" (AD04)."""

    first_name: str
    email: str
    group_name: str
    # Até quando o link vale (7 dias).
    expires_at: datetime
    # False: o convite existe, mas o e-mail não saiu. A equipe vê o alerta
    # "Não deu pra enviar o e-mail pra ..." e o "Reenviar" fica na lista.
    email_sent: bool


class GroupOut(BaseModel):
    id: int
    name: str
    city: str | None


class CoordinatorListOut(BaseModel):
    items: list[CoordinatorRowOut]
    # Contam a lista toda, sem o filtro e sem a busca.
    counts: CoordinatorCountsOut
