from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.followup.models import ComputingView, FollowupRound


class ComparedOut(BaseModel):
    """Quantas fizeram algo, entre as participantes e entre as que não compareceram."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    participants: int
    no_shows: int


class AfterActionOut(BaseModel):
    """O card "Logo depois da ação" (RF-F5.09, RF-F5.31). O front lê em camelCase.

    Só totais, nunca uma menina (RF-F5.08, RN-50): `participants` e `no_shows`
    são o "de M" de cada lado. `returned`, `started_file` e `concluded_file`
    são quantas de cada lado voltaram a outra ação, começaram o filé e
    concluíram algo nele. O front calcula a porcentagem.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    participants: int
    no_shows: int
    returned: ComparedOut
    started_file: ComparedOut
    concluded_file: ComparedOut


class MilestoneOut(BaseModel):
    """Uma barra de "Como o interesse evolui": quantas responderam e cada opção.

    `counts` tem as quatro opções, na ordem do melhor ao pior, também as com
    zero. O front calcula a porcentagem (cada barra soma 100%).
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    answered: int
    counts: dict[ComputingView, int]


class ChangeOut(BaseModel):
    """Uma mudança "de qual opção para qual" e quantas meninas a fizeram."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    origin: ComputingView
    destination: ComputingView
    girls: int


class MovementOut(BaseModel):
    """O card "Quem mudou de situação". `with_both` é o "N com as duas"."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    with_both: int
    went_up: int
    stayed: int
    went_down: int
    common_changes: list[ChangeOut]


class InterestOut(BaseModel):
    """Os cards "Como o interesse evolui" e "Quem mudou de situação" (RF-F5.04, RF-F5.32).

    Só totais, nunca uma menina e nunca um comentário (RN-11, RN-50).
    `rounds` tem as quatro rodadas: 3, 6, 12 e 18 meses.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    signup: MilestoneOut
    rounds: dict[FollowupRound, MilestoneOut]
    movement: MovementOut
