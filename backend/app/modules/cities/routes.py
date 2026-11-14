from typing import Annotated

from fastapi import APIRouter, Query

from app.db.engine import AsyncSessionDep
from app.modules.cities.schemas import CityOut
from app.modules.cities.service import search_cities
from app.modules.cities.utils import city_label

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
