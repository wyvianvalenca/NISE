from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.results.future_self import FutureSelfMilestone, ParticipationGroup


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


class FutureSelfPointOut(BaseModel):
    """Um marco de uma linha: `sure` de `responses` disseram "Com certeza"."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    milestone: FutureSelfMilestone
    responses: int
    sure: int


class FutureSelfLineOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    group: ParticipationGroup
    girls: int
    points: list[FutureSelfPointOut]


class FutureSelfOut(BaseModel):
    """O card "Elas se veem na computação no futuro?" (RF-F5.33, RN-50).

    Quatro linhas, cada uma com os cinco marcos. Só totais, nunca uma menina
    (RN-04): "Nunca participaram" aparece só como contagem. O front calcula a
    porcentagem `sure / responses` e deixa lacuna onde `responses` é 0.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    lines: list[FutureSelfLineOut]
