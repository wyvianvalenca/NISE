import enum
from datetime import date

from pydantic import BaseModel, Field

from app.modules.girls.models import EffortBand


class EventStatus(enum.Enum):
    """Onde o evento está no filé dela, como a A06·4b lê (frontend/lib/evento.ts).

    O banco guarda a inscrição como `FileStatus.SIGNED_UP`; a tela chama de
    "in_progress" ("Inscrita"), o mesmo modelo das atividades (tabela da #118).
    """

    NEXT = "next"
    IN_PROGRESS = "in_progress"  # "Inscrita"
    CONCLUDED = "concluded"


class EventType(enum.Enum):
    """Os tipos que a A06·4b conhece: os de ação (ActionType, RF-F17.01).

    Um evento da curadoria que não é hackathon vira "outro", que a tela chama de
    "Evento". O nome do tipo de verdade vai em `type_label`.
    """

    OFICINA = "oficina"
    PALESTRA = "palestra"
    MINICURSO = "minicurso"
    HACKATHON = "hackathon"
    VISITA = "visita"
    ACOLHIMENTO = "acolhimento"
    OUTRO = "outro"


class EventOut(BaseModel):
    """O detalhe de um evento do filé (A06·4b, #178, RF-F10.13). O front lê em camelCase.

    Os campos seguem `EventDetail` em frontend/lib/evento.ts. As contas de dias
    são feitas aqui, no fuso de Maceió, para o front não depender do relógio do
    celular.
    """

    # "curadoria-12" ou "acao-7": o id do catálogo, o mesmo do filé.
    id: str
    status: EventStatus
    type: EventType
    # O selo do topo, ex.: "Hackathon", "Olimpíada".
    type_label: str = Field(serialization_alias="typeLabel")
    # O tema principal, já escrito para a tela, ex.: "Programação". Vazio quando
    # o evento não tem tema.
    topic: str | None
    band: EffortBand
    title: str
    # O grupo da NISE que organiza (F30). Vazio é evento de fora, da curadoria
    # (RN-19); o organizador dele vai em `organizer`.
    group: str | None
    organizer: str
    # Primeiro e último dia; iguais num evento de um dia só.
    starts_on: date = Field(serialization_alias="startsOn")
    ends_on: date = Field(serialization_alias="endsOn")
    # Vazio é evento online.
    city: str | None
    # Último dia das inscrições. Vazio quando não há prazo: as ações dos grupos
    # só têm "inscrições abertas" ou não.
    deadline: date | None
    # Dias até o fim das inscrições; 0 é o último dia (ou já fechou). Vazio
    # quando não há prazo.
    days_left: int | None = Field(serialization_alias="daysLeft")
    # false quando as inscrições fecharam; o evento continua no filé (RN-36).
    registrations_open: bool = Field(serialization_alias="registrationsOpen")
    # Dias até o primeiro dia do evento; 0 é hoje (ou já começou).
    days_until_start: int = Field(serialization_alias="daysUntilStart")
    # true depois do fim do último dia do evento, no fuso de Maceió (#190).
    after_event: bool = Field(serialization_alias="afterEvent")
    # Vazio quando é grátis ou não informado: a tela mostra "Grátis".
    cost: str | None
    # A etapa mínima do público, ex.: "Ensino médio". Vazio se serve para todas.
    stage: str | None
    # Os pré-requisitos, um por linha do cadastro.
    prerequisites: list[str]
    # O link de inscrição, como foi cadastrado. A NISE guarda só o link (RN-19).
    # Vazio numa ação fechada, que não tem link.
    registration_url: str | None = Field(serialization_alias="registrationUrl")
