from fastapi import Request, status
from fastapi.responses import JSONResponse


class TermsNotAcceptedError(Exception):
    """A menina ainda não aceitou a versão atual dos termos (#53)."""


async def terms_not_accepted_handler(request: Request, exc: Exception) -> JSONResponse:
    # O front lê este código e leva ela de volta à A04·1.
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"error": "terms_not_accepted"},
    )
