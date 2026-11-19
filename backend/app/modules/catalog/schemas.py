from datetime import date

from pydantic import BaseModel

from app.modules.actions.models import ActionFormat
from app.modules.catalog.models import EffortBand, ItemKind, ItemLevel, ItemOrigin
from app.modules.girls.models import StudyStage, Topic


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
