from pydantic import BaseModel

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
