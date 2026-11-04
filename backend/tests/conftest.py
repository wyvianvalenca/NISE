from fastapi.testclient import TestClient
from collections.abc import Generator
import os
import pytest
from app.main import app

# Os testes não usam o banco de verdade, mas importar o app cria o engine,
# que exige um DATABASE_URL. Este é fictício; o engine só conecta quando usado.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost:5432/teste"
)

@pytest.fixture(scope="module")
def client() -> Generator[TestClient]:
    with TestClient(app) as client:
        yield client
