from fastapi import Request, status
from fastapi.responses import JSONResponse


class InvalidCityError(Exception):
    """A cidade enviada não está na lista do IBGE (RN-17)."""


async def invalid_city_handler(request: Request, exc: Exception) -> JSONResponse:
    # O front do cadastro (#51, #52) lê exatamente este corpo para mostrar o
    # erro junto ao campo de cidade.
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"error": "invalid_city"},
    )
