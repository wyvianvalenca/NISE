import enum

from fastapi import Request, status
from fastapi.responses import JSONResponse


class SignupErrorCode(enum.StrEnum):
    """Motivos de recusa do cadastro que o front sabe mostrar.

    São os mesmos códigos que frontend/lib/signup-api.ts lê em
    createEmailAccount. A cidade fora da lista usa InvalidCityError (#50).
    """

    UNDER_13 = "under_13"
    INVALID_BIRTH_DATE = "invalid_birth_date"
    INVALID_EMAIL = "invalid_email"
    PASSWORD_TOO_SHORT = "password_too_short"
    INVALID_INVITE = "invalid_invite"


class SignupError(Exception):
    """O cadastro foi recusado por um motivo que o front mostra junto ao campo."""

    def __init__(self, code: SignupErrorCode) -> None:
        super().__init__(code.value)
        self.code = code


async def signup_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Só o código vai na resposta. Nada do corpo do pedido é guardado ou
    # logado, nem para quem tem menos de 13 anos (RN-03).
    assert isinstance(exc, SignupError)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"error": exc.code.value},
    )
