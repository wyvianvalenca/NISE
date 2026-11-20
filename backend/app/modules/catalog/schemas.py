from datetime import date
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

from app.modules.actions.models import ActionFormat
from app.modules.catalog.models import (
    CuratedType,
    ItemKind,
    ItemLevel,
    ItemOrigin,
)
from app.modules.girls.models import EffortBand, StudyStage, Topic


class EventInfo(BaseModel):
    """O que só um evento tem, para o detalhe do evento (RF-F10.13)."""

    starts_on: date
    ends_on: date
    # Último dia de inscrição. Vazio quando a fonte não informa um prazo.
    registration_deadline: date | None
    organizer: str
    prerequisites: str | None


class CatalogItem(BaseModel):
    """Um item que pode ser sugerido, no mesmo formato para as duas fontes.

    Itens da curadoria e ações dos grupos saem daqui iguais (RF-F11.01), para
    as sugestões (#80) e as telas do filé não precisarem saber de onde vieram.
    """

    # "curadoria-12" ou "acao-7" (veja item_id em utils.py).
    id: str
    origin: ItemOrigin
    kind: ItemKind
    # Código do tipo (CuratedType ou ActionType) e o nome que aparece na tela.
    type: str
    type_label: str
    title: str
    # Quem oferece: a fonte da curadoria ou o nome do grupo.
    source: str
    description: str
    # O link da fonte ou do grupo, como foi cadastrado. Nada da menina é
    # acrescentado a ele (RN-19).
    url: str
    effort_band: EffortBand
    level: ItemLevel
    # Os mesmos códigos dos temas do perfil (#56), então perfil e item se cruzam
    # sem tradução. As tags de uma ação já são esses temas (RF-F17.02, D-44).
    topics: list[Topic]
    # Etapas de estudo do público; vazio quer dizer que serve para todas.
    stages: list[StudyStage]
    format: ActionFormat
    city_ibge_code: int | None
    min_age: int | None
    # Em centavos; 0 é grátis e vazio é "não informado" (as ações não têm custo).
    cost_cents: int | None
    duration: str
    # Só nos eventos.
    event: EventInfo | None


def _without_repeats[T](values: list[T]) -> list[T]:
    # O mesmo código duas vezes vale como um, na ordem do arquivo.
    return list(dict.fromkeys(values))


class CuratedItemIn(BaseModel):
    """Um item do arquivo da curadoria (scripts/dados/curadoria.json, RF-F11.06).

    Os códigos são os valores dos enums: "atividade", "primeiros-passos",
    "iniciante", "programacao", "online" etc. Um campo a mais é recusado, para
    um erro de digitação no nome não passar calado.
    """

    model_config = ConfigDict(extra="forbid")

    # Só letras minúsculas, números e hífens, ex.: "scratch-primeiro-projeto".
    slug: Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]
    kind: ItemKind
    type: CuratedType
    title: Annotated[str, Field(min_length=1)]
    source: Annotated[str, Field(min_length=1)]
    description: Annotated[str, Field(min_length=1)]
    url: Annotated[str, Field(pattern=r"^https://\S+$")]
    effort_band: EffortBand
    level: ItemLevel
    topics: Annotated[
        list[Topic], Field(min_length=1), AfterValidator(_without_repeats)
    ]
    # Vazio: serve para todas as etapas de estudo.
    stages: Annotated[list[StudyStage], AfterValidator(_without_repeats)] = []
    format: ActionFormat
    city_ibge_code: int | None = None
    min_age: Annotated[int, Field(ge=0)] | None = None
    cost_cents: Annotated[int, Field(ge=0)] = 0
    duration: Annotated[str, Field(min_length=1)]
    expires_on: date | None = None
    active: bool = True
    starts_on: date | None = None
    ends_on: date | None = None
    registration_deadline: date | None = None
    prerequisites: str | None = None

    @model_validator(mode="after")
    def city_and_event_fields(self) -> Self:
        # As mesmas regras das restrições da tabela, com mensagens legíveis.
        if self.format is ActionFormat.IN_PERSON and self.city_ibge_code is None:
            raise ValueError("Item presencial precisa de city_ibge_code")
        if self.format is ActionFormat.ONLINE and self.city_ibge_code is not None:
            raise ValueError("Item online não tem cidade")

        event_fields = (
            self.starts_on,
            self.ends_on,
            self.registration_deadline,
            self.prerequisites,
        )
        if self.kind is ItemKind.ACTIVITY:
            if any(value is not None for value in event_fields):
                raise ValueError(
                    "Só evento tem starts_on, ends_on, registration_deadline"
                    " e prerequisites"
                )
            return self

        if self.starts_on is None or self.ends_on is None:
            raise ValueError("Evento precisa de starts_on e ends_on")
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on não pode ser antes de starts_on")
        # Inscrição depois do fim do evento não faz sentido.
        if (
            self.registration_deadline is not None
            and self.registration_deadline > self.ends_on
        ):
            raise ValueError("registration_deadline não pode ser depois de ends_on")
        # Vencido antes de começar, o evento nunca apareceria nas sugestões.
        if self.expires_on is not None and self.expires_on < self.starts_on:
            raise ValueError("expires_on não pode ser antes de starts_on")
        return self
