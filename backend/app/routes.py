from fastapi import APIRouter

from app.auth.routes import router as auth_router

router = APIRouter()
router.include_router(auth_router)


@router.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    # Só confirma que a API está de pé; não consulta o banco.
    return {"status": "ok"}
