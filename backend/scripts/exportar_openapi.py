"""Grava o OpenAPI do FastAPI num arquivo, para o front gerar os tipos.

Rode dentro de frontend/, que chama este script e depois o openapi-typescript:

    pnpm api:types

Ou só este passo, dentro de backend/:

    uv run python -m scripts.exportar_openapi ../frontend/lib/api/openapi.json

Não precisa de banco: importar o app cria o engine, mas ele só conecta quando
usado. Por isso um DATABASE_URL fictício basta quando não há .env.
"""

import json
import os
import sys
from pathlib import Path

os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://openapi:openapi@localhost:5432/openapi"
)
os.environ.setdefault("JWT_SECRET", "segredo-ficticio-so-para-o-openapi-32b")

from app.main import app


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Uso: python -m scripts.exportar_openapi <arquivo.json>")

    destino = Path(sys.argv[1])
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"OpenAPI gravado em {destino}")


if __name__ == "__main__":
    main()
