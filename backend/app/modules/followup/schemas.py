from datetime import date
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)
from pydantic.alias_generators import to_camel

from app.modules.followup.models import (
    Activity,
    ComputingView,
    FollowupRound,
    FutureSelf,
    HelpWanted,
)
from app.modules.girls.schemas import OptionOut

# O front lê e manda em camelCase (lastDay, firstName, computingView).
CAMEL_CASE = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CurrentFollowupOut(BaseModel):
    """A rodada aberta hoje para a menina da sessão (A18, #293)."""

    model_config = CAMEL_CASE

    round: FollowupRound
    # O último dia em que ainda dá para responder (RN-39).
    last_day: date
    # Para o título "Como está seu caminho, <nome>?". Vai só para ela mesma.
    first_name: str
    # Ela já respondeu esta rodada: a tela mostra o aviso em vez do formulário.
    answered: bool


class FollowupOptionsOut(BaseModel):
    """As opções das perguntas fechadas da A18, na ordem do Figma."""

    model_config = CAMEL_CASE

    computing_views: list[OptionOut]
    future_selves: list[OptionOut]
    activities: list[OptionOut]
    helps: list[OptionOut]


def _without_repeats[T](choices: list[T]) -> list[T]:
    # A mesma escolha duas vezes vale como uma, na ordem em que ela escolheu.
    return list(dict.fromkeys(choices))


class FollowupIn(BaseModel):
    """As respostas da A18 (RF-F4.13, RF-F4.08).

    Toda pergunta é opcional, mas pelo menos uma precisa de resposta: sem
    nenhuma, a tela não deixa enviar, e "Agora não" não chama o back.
    Códigos fora das listas são recusados, e campos desconhecidos também.
    """

    model_config = ConfigDict(**CAMEL_CASE, extra="forbid")

    # A rodada que a tela mostrou. Se ela fechou enquanto a tela estava
    # aberta, o envio é recusado.
    round: FollowupRound
    computing_view: ComputingView | None = None
    future_self: FutureSelf | None = None
    # O limite é o tamanho da lista, para ninguém mandar um corpo enorme.
    activities: Annotated[
        list[Activity],
        Field(max_length=len(Activity)),
        AfterValidator(_without_repeats),
    ] = []
    helps: Annotated[
        list[HelpWanted],
        Field(max_length=len(HelpWanted)),
        AfterValidator(_without_repeats),
    ] = []
    # O mesmo limite do campo na tela. Só espaços conta como sem comentário.
    comment: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None
    ) = None

    @model_validator(mode="after")
    def at_least_one_answer(self) -> Self:
        # A tela confere antes; o servidor confere de novo (RNF-G.03).
        if Activity.NONE_YET in self.activities and len(self.activities) > 1:
            raise ValueError('"Nada disso ainda" não vem junto com outras escolhas')
        answered = (
            self.computing_view is not None
            or self.future_self is not None
            or self.activities
            or self.helps
            or self.comment
        )
        if not answered:
            raise ValueError("Responda pelo menos uma pergunta")
        return self
