from fastapi import APIRouter

router = APIRouter()

@router.get("/health", tags=["Health"])
def checkhealth():
    return {"status": "ok"}
