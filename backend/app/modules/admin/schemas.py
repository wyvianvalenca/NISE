import enum
from datetime import datetime

from pydantic import BaseModel


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


class CoordinatorListOut(BaseModel):
    items: list[CoordinatorRowOut]
    # Contam a lista toda, sem o filtro e sem a busca.
    counts: CoordinatorCountsOut
