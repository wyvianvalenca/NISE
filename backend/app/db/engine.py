from fastapi import Depends
from typing import Annotated, AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.config import settings

engine = create_async_engine(settings.database_url)

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_sessionmaker(engine)() as session:
        yield session

AsyncSessionDep = Annotated[AsyncSession, Depends(get_session)]
