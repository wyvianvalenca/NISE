from fastapi import APIRouter

from app.auth.routes import router as auth_router
from app.modules.answers.routes import router as ratings_router
from app.modules.cities.routes import router as cities_router
from app.modules.consents.routes import preferences_router
from app.modules.consents.routes import router as consents_router
from app.modules.girls.routes import router as profile_router
from app.modules.groups.routes import router as groups_router
from app.modules.suggestions.routes import router as discover_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(cities_router)
router.include_router(consents_router)
router.include_router(preferences_router)
router.include_router(groups_router)
router.include_router(ratings_router)
router.include_router(profile_router)
router.include_router(discover_router)


@router.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    # Só confirma que a API está de pé; não consulta o banco.
    return {"status": "ok"}
