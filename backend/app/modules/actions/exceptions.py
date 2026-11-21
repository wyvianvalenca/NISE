from fastapi import Request, status
from fastapi.responses import JSONResponse


class ActionValidationError(Exception):
    """One or more fields of an action break a rule of the form (RF-F30.05).

    `errors` maps the field name to the message in Portuguese that the form
    shows next to that field. Nothing is saved when this is raised.
    """

    def __init__(self, errors: dict[str, str]) -> None:
        super().__init__(errors)
        self.errors = errors


async def action_validation_handler(request: Request, exc: Exception) -> JSONResponse:
    # Same shape as the 422 that FastAPI itself sends for a malformed body, so the
    # form reads both kinds of error the same way: detail[].loc and detail[].msg.
    assert isinstance(exc, ActionValidationError)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "detail": [
                {"loc": ["body", field], "msg": message, "type": "value_error"}
                for field, message in exc.errors.items()
            ]
        },
    )
