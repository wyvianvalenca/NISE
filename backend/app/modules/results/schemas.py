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
