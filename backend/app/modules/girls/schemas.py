from pydantic import BaseModel


class OptionOut(BaseModel):
    """Uma opção de lista fechada: o código vai para o back, o nome vai para a tela."""

    code: str
    label: str


class InterestOptionsOut(BaseModel):
    """As listas de temas e de etapas de estudo da A05 (RF-F10.01)."""

    topics: list[OptionOut]
    stages: list[OptionOut]
