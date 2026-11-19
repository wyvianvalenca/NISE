from pydantic import BaseModel, Field

from app.modules.actions.models import ActionFormat
from app.modules.catalog.models import EffortBand
from app.modules.catalog.schemas import CatalogItem


class Suggestion(CatalogItem):
    """Um item do catálogo sugerido a uma menina, com o "Por que pra você"."""

    # Montado por regras, ex.: "você curtiu Programação e Dados" (RF-F11.04).
    # Vazio quando nenhuma regra explica a sugestão.
    why: str | None


class BandSuggestions(BaseModel):
    """As sugestões de uma faixa de esforço, já na ordem (RF-F10.03)."""

    band: EffortBand
    # Quantas sugestões a faixa tem, para o cartão do Descobrir (A06·1).
    count: int
    items: list[Suggestion]


class BandCountOut(BaseModel):
    """Uma faixa do Descobrir e quantas sugestões ela tem (A06·1, RF-F10.03).

    O nome, a descrição, o ícone e o grupo ("Sozinha", "Em grupo") são fixos
    pela faixa e ficam no front (BANDS em frontend/lib/descobrir.ts).
    """

    code: EffortBand
    # 0 quando a faixa não tem sugestões; o cartão mostra "Por enquanto, nada marcado.".
    count: int


class DiscoverOut(BaseModel):
    """A tela Descobrir (A06·1, #86). O front lê em camelCase (DiscoverData)."""

    # Para o "Oi, <nome>!". É o nome dela mesma, a da sessão.
    first_name: str = Field(serialization_alias="firstName")
    # As 5 faixas, sempre na ordem da tela.
    bands: list[BandCountOut]
    # A faixa aberta da última vez, para a tag "da última vez"; vazia se ela
    # nunca abriu nenhuma.
    last_band: EffortBand | None = Field(serialization_alias="lastBand")


class LastBandIn(BaseModel):
    """A faixa que ela acabou de abrir no Descobrir."""

    band: EffortBand


class SuggestionCardOut(BaseModel):
    """O que o card de uma sugestão mostra (A06·2, #102). O front lê em camelCase.

    O formato e o custo vão como código e número; o texto da tela ("Online",
    "Grátis", "R$ 20") é montado no front (frontend/lib/sugestoes.ts).
    """

    # "curadoria-12" ou "acao-7": é o id que a escolha usa (PUT /api/file/{id}).
    id: str
    # O selo do topo do card, ex.: "Curso online".
    type_label: str = Field(serialization_alias="typeLabel")
    title: str
    source: str
    format: ActionFormat
    duration: str
    # Em centavos; 0 é grátis e vazio é "não informado" (as ações não têm custo).
    cost_cents: int | None = Field(serialization_alias="costCents")
    # Vazia quando o item não tem idade mínima.
    min_age: int | None = Field(serialization_alias="minAge")
    # "Por que pra você" (RF-F11.04); vazio quando nenhuma regra explica.
    why: str | None


class BandSuggestionsOut(BaseModel):
    """As sugestões de uma faixa, na ordem da #80, e o total do filé (A06·2)."""

    band: EffortBand
    # Para a pílula "Meu filé".
    file_total: int = Field(serialization_alias="fileTotal")
    items: list[SuggestionCardOut]
