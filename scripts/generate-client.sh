#!/usr/bin/env bash
# Regenera o cliente da API do front (frontend/lib/api/) a partir do OpenAPI
# do FastAPI. Rode na raiz do repositório depois de mudar qualquer rota; o hook
# `generate-client` do prek faz isso sozinho quando um arquivo do back muda.
# Detalhes em docs/ferramentas.md.
set -euo pipefail

cd "$(dirname "$0")/.."

# Importar o app exige estas variáveis, mas gerar o OpenAPI não conecta em
# nada: os valores são fictícios (os mesmos do backend/tests/conftest.py).
export DATABASE_URL="postgresql+asyncpg://teste:teste@localhost:5432/teste"
export JWT_SECRET="segredo-ficticio-para-testes-32b"

uv run --directory backend python -c \
  "import json; from app.main import app; print(json.dumps(app.openapi()))" \
  > frontend/openapi.json

cd frontend
pnpm exec openapi-ts
pnpm exec prettier --write --log-level warn openapi.json lib/api
