from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.dates.models import ImportantDate


async def add_important_date(
    session: AsyncSession, title: str, on: date, details: str | None
) -> bool:
    """Cadastra a data. False se já existia uma com o mesmo título e dia.

    Rodar o script de novo com os mesmos dados não duplica nada.
    """
    result = await session.execute(
        insert(ImportantDate)
        .values(title=title, on=on, details=details)
        .on_conflict_do_nothing(index_elements=["title", "on"])
        .returning(ImportantDate.id)
    )
    await session.commit()
    return result.scalar() is not None


async def list_important_dates(
    session: AsyncSession, since: date
) -> list[ImportantDate]:
    """As datas de `since` em diante, da mais próxima para a mais distante."""
    result = await session.scalars(
        select(ImportantDate)
        .where(ImportantDate.on >= since)
        .order_by(ImportantDate.on, ImportantDate.title)
    )
    return list(result)
