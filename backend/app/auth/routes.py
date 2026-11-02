from fastapi import APIRouter, Response, status

from app.auth.permissions import CurrentUserDep, clear_session_cookie
from app.users.models import User
from app.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUserDep) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    clear_session_cookie(response)
