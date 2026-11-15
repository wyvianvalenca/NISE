from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel


class PendingRatingOut(BaseModel):
    """A ação que a menina pode avaliar na A03 (#58).

    O front lê em camelCase (PendingRating em frontend/lib/signup-api.ts) e
    monta a data e a cidade como no Figma ("Sáb, 11 de out · Maceió").
    """

    action_id: int = Field(serialization_alias="actionId")
    action_name: str = Field(serialization_alias="actionName")
    group_name: str = Field(serialization_alias="groupName")
    starts_on: date = Field(serialization_alias="startsOn")
    # Vazio quando a ação é online e não tem cidade.
    city_name: str | None = Field(serialization_alias="cityName")


class RatingIn(BaseModel):
    """A nota de 1 a 5 e o comentário opcional da A03 (RF-F4.03a).

    O front manda em camelCase (actionId). Quem confere se ela pode avaliar a
    ação é o serviço.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    action_id: int
    # strict: só aceita número inteiro. Um texto como "4" é recusado.
    score: int = Field(ge=1, le=5, strict=True)
    # O mesmo limite do campo na tela. Só espaços conta como sem comentário.
    comment: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None
    ) = None
