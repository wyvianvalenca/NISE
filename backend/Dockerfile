# Imagem de desenvolvimento do back-end, usada pelo docker compose.
# Em produção quem roda o FastAPI é a Vercel, então não há estágio de produção aqui.
#
# O contexto do build é a raiz do repositório (veja o docker-compose.yml),
# porque o uv.lock é do workspace inteiro e fica na raiz.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Sem dependências de desenvolvimento (pytest, ruff, mypy, prek) dentro da imagem.
ENV UV_NO_DEV=1

WORKDIR /app

# Instala as dependências primeiro para aproveitar o cache de camadas.
COPY pyproject.toml uv.lock .python-version ./
COPY backend/pyproject.toml backend/
RUN uv sync --locked --package backend --no-install-project

COPY backend/ backend/

WORKDIR /app/backend

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
