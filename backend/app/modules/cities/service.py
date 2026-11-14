from collections.abc import Sequence

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cities.exceptions import InvalidCityError
from app.modules.cities.models import City
from app.modules.cities.utils import normalize_search

# As meninas são de Alagoas: numa busca como "sao jose", os municípios de
# Alagoas vêm antes dos homônimos de outros estados.
PRIORITY_STATE = "AL"

SEARCH_LIMIT = 10


async def search_cities(session: AsyncSession, search: str) -> Sequence[City]:
    term = normalize_search(search)

    # autoescape: um "%" ou "_" digitado é procurado como texto, não como curinga.
    starts_with_term = City.search_name.startswith(term, autoescape=True)
    statement = (
        select(City)
        .where(City.search_name.contains(term, autoescape=True))
        .order_by(
            case((City.state == PRIORITY_STATE, 0), else_=1),
            case((starts_with_term, 0), else_=1),
            City.search_name,
        )
        .limit(SEARCH_LIMIT)
    )

    result = await session.scalars(statement)
    return result.all()


async def ensure_city_exists(session: AsyncSession, city_id: int) -> City:
    """Devolve o município ou levanta InvalidCityError (RN-17).

    Para as rotas de cadastro (#51, #52) e de ações: a resposta vira
    422 {"error": "invalid_city"}.
    """
    city = await session.get(City, city_id)

    if city is None:
        raise InvalidCityError

    return city
