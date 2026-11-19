from pydantic import BaseModel, Field

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
