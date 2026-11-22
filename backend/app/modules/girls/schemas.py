from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    Field,
    StrictBool,
    model_validator,
)

from app.modules.girls.models import StudyStage, Topic


class OptionOut(BaseModel):
    """Uma opção de lista fechada: o código vai para o back, o nome vai para a tela."""

    code: str
    label: str


class InterestOptionsOut(BaseModel):
    """As listas de temas e de etapas de estudo da A05 (RF-F10.01)."""

    topics: list[OptionOut]
    stages: list[OptionOut]


def _without_repeats(topics: list[Topic]) -> list[Topic]:
    # O mesmo tema duas vezes vale como uma, na ordem em que ela escolheu.
    return list(dict.fromkeys(topics))


class InterestsIn(BaseModel):
    """O que ela escolheu na A05: temas e etapa de estudo (RF-F10.01).

    Códigos fora das listas são recusados. Não há "Pular por agora" (D-19):
    ela escolhe pelo menos um tema ou "Ainda não sei, me mostra de tudo", e a
    etapa de estudo é obrigatória.
    """

    # Códigos dos temas; vazio quando ela escolhe "me mostra de tudo". O limite
    # é o tamanho da lista, para ninguém mandar um corpo enorme.
    topics: Annotated[
        list[Topic], Field(max_length=len(Topic)), AfterValidator(_without_repeats)
    ]
    # "Ainda não sei, me mostra de tudo". StrictBool: um texto como "false" é
    # recusado em vez de virar True.
    everything: StrictBool
    stage: StudyStage

    @model_validator(mode="after")
    def topics_or_everything(self) -> Self:
        # A tela desmarca um quando ela escolhe o outro; o servidor confere de
        # novo (RNF-G.03).
        if self.everything and self.topics:
            raise ValueError('Escolha temas ou "me mostra de tudo", não os dois')
        if not self.everything and not self.topics:
            raise ValueError('Escolha pelo menos um tema ou "me mostra de tudo"')
        return self


class ProfileOut(BaseModel):
    """O perfil da menina da sessão, do jeito que o app lê.

    Por enquanto só o que o filé precisa: se ela já viu "Por que filé?"
    (RF-F10.02, #84). O front lê em camelCase (Profile em
    frontend/lib/file-intro.ts). Sem nome, e-mail nem data de nascimento.
    """

    file_intro_seen: bool = Field(serialization_alias="fileIntroSeen")
