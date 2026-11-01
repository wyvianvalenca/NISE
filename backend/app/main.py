from fastapi import FastAPI

from app.routes import router

app = FastAPI()

app.include_router(router=router, prefix="/api", tags=["API"])


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)


# Só sobe o servidor ao rodar o arquivo direto; importar o app (testes, Vercel)
# não pode iniciar o uvicorn.
if __name__ == "__main__":
    main()
