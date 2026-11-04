import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

# Os testes não usam o banco de verdade, mas importar o app cria o engine,
# que exige um DATABASE_URL. Este é fictício; o engine só conecta quando usado.
# Por isso ele é definido antes de importar o app.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost:5432/teste"
)

from app.main import app


@pytest.fixture(scope="module")
def client() -> Generator[TestClient]:
    with TestClient(app) as client:
        yield client
