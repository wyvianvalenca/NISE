from fastapi import APIRouter

router = APIRouter()


@router.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    # Só confirma que a API está de pé; não consulta o banco.
    return {"status": "ok"}
