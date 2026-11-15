from datetime import date

from pydantic import BaseModel, Field


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
