from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


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


class EnteredBarOut(BaseModel):
    """Uma barra do card "Elas entraram na área?": contagens, o front faz a %."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    months: int
    answered: int
    graduacao: int
    tecnico: int
    trying: int
    not_yet: int


class EnteredStageOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    stage: str
    bars: list[EnteredBarOut]


class EnteredFieldOut(BaseModel):
    """O card "Elas entraram na área?" (RF-F5.34): as três etapas, 3 barras cada.

    Só contagens (RN-50), sem nome de menina, de curso nem de instituição.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    stages: list[EnteredStageOut]
