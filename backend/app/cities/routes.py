from typing import Annotated

from fastapi import APIRouter, Query

from app.cities.schemas import CityOut
from app.cities.service import search_cities
from app.cities.utils import city_label
from app.db.engine import AsyncSessionDep

router = APIRouter(prefix="/cities", tags=["Cities"])


# Rota pública: o cadastro acontece antes do login, e a lista do IBGE é pública.
@router.get("", response_model=list[CityOut])
async def list_cities(
    session: AsyncSessionDep,
    search: Annotated[str, Query(min_length=2, max_length=100)],
) -> list[CityOut]:
    cities = await search_cities(session, search)

    return [
        CityOut(id=str(city.id), name=city_label(city.name, city.state))
        for city in cities
    ]
