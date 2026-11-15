from fastapi import FastAPI

from app.auth.exceptions import SignupError, signup_error_handler
from app.modules.cities.exceptions import InvalidCityError, invalid_city_handler
from app.modules.consents.exceptions import (
    TermsNotAcceptedError,
    terms_not_accepted_handler,
)
from app.routes import router

app = FastAPI()

app.add_exception_handler(InvalidCityError, invalid_city_handler)
app.add_exception_handler(SignupError, signup_error_handler)
app.add_exception_handler(TermsNotAcceptedError, terms_not_accepted_handler)

app.include_router(router=router, prefix="/api", tags=["API"])


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)


# Só sobe o servidor ao rodar o arquivo direto; importar o app (testes, Vercel)
# não pode iniciar o uvicorn.
if __name__ == "__main__":
    main()
