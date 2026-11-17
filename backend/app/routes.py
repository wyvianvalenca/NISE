from fastapi import APIRouter

from app.auth.routes import router as auth_router
from app.modules.cities.routes import router as cities_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(cities_router)


@router.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    # Só confirma que a API está de pé; não consulta o banco.
    return {"status": "ok"}
