from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.auth.routes import router as auth_router
from app.db.engine import AsyncSessionDep

router = APIRouter()
router.include_router(auth_router)


@router.get("/health", tags=["Health"])
async def checkhealth(session: AsyncSessionDep) -> dict[str, str]:
    # Um "select 1" confirma que o banco responde, sem ler nenhuma tabela.
    try:
        await session.execute(text("select 1"))
    except (SQLAlchemyError, OSError) as error:
        # OSError cobre conexão recusada, que o asyncpg levanta antes do SQLAlchemy.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Banco de dados indisponível",
        ) from error
    return {"status": "ok"}
