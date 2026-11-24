import asyncio
import os
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import make_url, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command

# Banco dos testes que usam o Postgres de verdade (fixture `db_session`). É um
# banco separado, `nise_test`, no mesmo Postgres do docker compose, para não
# mexer nos dados do ambiente local. Os testes sem `db_session` não conectam.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://nise:nise@localhost:5432/nise_test"
)

# Importar o app cria o engine, que lê o DATABASE_URL. Ele aponta sempre para o
# banco de teste (mesmo que o ambiente já tenha um DATABASE_URL, como dentro do
# docker compose), para nenhum teste alcançar o banco do dia a dia. O engine só
# conecta quando usado. Por isso é definido antes de importar o app.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("JWT_SECRET", "segredo-ficticio-para-testes-32b")

from app.main import app

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def client() -> Generator[TestClient]:
    with TestClient(app) as client:
        yield client


async def _recreate_test_database(url: str) -> None:
    """Apaga o banco de teste (se existir) e cria um vazio."""
    parts = make_url(url)
    # DROP/CREATE DATABASE não rodam dentro de transação nem no próprio banco:
    # conecta no banco `postgres`, em modo autocommit.
    engine = create_async_engine(
        parts.set(database="postgres"),
        poolclass=NullPool,
        isolation_level="AUTOCOMMIT",
    )
    try:
        async with engine.connect() as connection:
            # Nome de banco não aceita parâmetro; ele vem da nossa própria URL.
            # Recriar do zero evita que um banco deixado por outra branch
            # (com outro schema) quebre o downgrade.
            await connection.execute(
                text(f'DROP DATABASE IF EXISTS "{parts.database}" WITH (FORCE)')
            )
            await connection.execute(text(f'CREATE DATABASE "{parts.database}"'))
    finally:
        await engine.dispose()


@pytest.fixture(scope="session")
def test_database() -> None:
    """Prepara o banco de teste uma vez por rodada do pytest.

    Também é o teste das migrações: aplica todas, desfaz todas, aplica de novo
    e confere que os models não têm mudança sem migração (o `alembic check`).
    """
    url = make_url(TEST_DATABASE_URL)
    database = url.database or ""
    # A fixture apaga o banco e recria. Estas travas impedem que um
    # TEST_DATABASE_URL errado apague um banco com dados de verdade.
    if not database.endswith("_test"):
        pytest.fail(
            f"O banco de teste precisa terminar em _test (recebi {database!r}). "
            "Confira o TEST_DATABASE_URL."
        )
    if url.host not in LOCAL_HOSTS:
        pytest.fail(
            f"O banco de teste precisa estar na sua máquina (recebi o host {url.host!r}). "
            "A fixture apaga e recria o banco; confira o TEST_DATABASE_URL."
        )

    try:
        asyncio.run(_recreate_test_database(TEST_DATABASE_URL))
    except (OSError, SQLAlchemyError) as error:
        pytest.fail(
            f"Não consegui conectar no Postgres dos testes ({error}). "
            "Suba o banco com `docker compose up -d db` ou defina TEST_DATABASE_URL."
        )

    # Sem o alembic.ini de propósito: ele reconfiguraria o logging do pytest.
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    command.check(config)


@pytest.fixture
async def db_session(test_database: None) -> AsyncGenerator[AsyncSession]:
    """Sessão no Postgres de teste que desfaz tudo ao fim de cada teste.

    O teste pode dar `commit` à vontade: a sessão trabalha dentro de uma
    transação externa (com savepoints), que é desfeita no final.
    """
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
        # O mesmo cuidado do app/db/engine.py com o pooler do Supabase.
        connect_args={"statement_cache_size": 0},
    )
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()
    await engine.dispose()
