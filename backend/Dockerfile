# Imagem de desenvolvimento do back-end, usada pelo docker compose.
# Em produção quem roda o FastAPI é a Vercel, então não há estágio de produção aqui.
#
# O contexto do build é a raiz do repositório (veja o docker-compose.yml),
# porque o uv.lock é do workspace inteiro e fica na raiz.

# Versão do uv fixada, a mesma usada na máquina e no CI. O Dependabot avisa
# quando sai outra.
FROM ghcr.io/astral-sh/uv:0.13.6-python3.12-trixie-slim

# Sem dependências de desenvolvimento (pytest, ruff, mypy, prek) dentro da imagem.
ENV UV_NO_DEV=1
# O cache do uv fica num volume do build (abaixo); copiar em vez de criar links
# evita avisos, porque o cache e a .venv ficam em sistemas de arquivos diferentes.
ENV UV_LINK_MODE=copy

WORKDIR /app

# Instala as dependências primeiro para aproveitar o cache de camadas. O cache
# do uv sobrevive entre builds: quando o uv.lock muda, só baixa o que é novo.
COPY pyproject.toml uv.lock .python-version ./
COPY backend/pyproject.toml backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --package backend --no-install-project

COPY backend/ backend/

WORKDIR /app/backend

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
