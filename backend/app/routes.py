from fastapi import APIRouter

from app.auth.routes import router as auth_router
from app.modules.actions.routes import router as actions_router
from app.modules.admissions.coordinator_routes import router as coordinator_router
from app.modules.admissions.cron import router as cron_router
from app.modules.admissions.routes import router as admissions_router
from app.modules.agenda.routes import router as agenda_router
from app.modules.answers.routes import router as ratings_router
from app.modules.cities.routes import router as cities_router
from app.modules.consents.routes import preferences_router
from app.modules.consents.routes import router as consents_router
from app.modules.followup.routes import router as followup_router
from app.modules.girl_file.routes import later_router
from app.modules.girl_file.routes import router as file_router
from app.modules.girls.routes import router as profile_router
from app.modules.groups.routes import router as groups_router
from app.modules.suggestions.routes import router as discover_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(actions_router)
router.include_router(cities_router)
router.include_router(consents_router)
router.include_router(preferences_router)
router.include_router(groups_router)
router.include_router(ratings_router)
router.include_router(profile_router)
router.include_router(discover_router)
router.include_router(file_router)
router.include_router(later_router)
router.include_router(admissions_router)
router.include_router(agenda_router)
router.include_router(cron_router)
router.include_router(followup_router)
router.include_router(coordinator_router)


@router.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    # Só confirma que a API está de pé; não consulta o banco.
    return {"status": "ok"}
