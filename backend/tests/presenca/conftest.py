"""A real Postgres for the attendance tests (C3, #135).

The attendance is mostly SQL (locks, unique constraints, ON CONFLICT), and a
fake session would only test the mock. So these tests run on a Postgres of
their own, `nise_test`, created if missing, with every migration applied. Each
test runs inside a transaction that is rolled back at the end, so they never
leave data behind and can run in any order.

The address comes from TEST_DATABASE_URL (default: the docker compose
Postgres, `docker compose up -d db`). The name must end in `_test`: the
migrations are applied there and nothing else may be touched.

When the shared `db_session` of the Postgres tests (#343) is merged, these
fixtures can be replaced by it.
"""

import asyncio
import os
from collections.abc import AsyncGenerator, Callable
from datetime import date
from pathlib import Path

import pytest
from alembic.config import Config
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import make_url, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from app.auth.permissions import SESSION_COOKIE
from app.auth.utils import create_access_token
from app.config import settings
from app.db.engine import get_session
from app.main import app
from app.modules.attendance.dependencies import current_day, email_connection
from app.users.models import User
from tests.presenca.dados import EVENT_DAY, CorreioFalso

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://nise:nise@localhost:5432/nise_test"
)
BACKEND_DIR = Path(__file__).resolve().parents[2]


async def _create_database(url: str) -> None:
    parts = make_url(url)
    engine = create_async_engine(
        parts.set(database="postgres"), poolclass=NullPool, isolation_level="AUTOCOMMIT"
    )
    try:
        async with engine.connect() as connection:
            exists = await connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": parts.database},
            )
            if not exists:
                await connection.execute(text(f'CREATE DATABASE "{parts.database}"'))
    finally:
        await engine.dispose()


@pytest.fixture(scope="session")
def postgres_presenca() -> None:
    """Creates `nise_test` if needed and applies every migration, once per run."""
    database = make_url(TEST_DATABASE_URL).database or ""
    if not database.endswith("_test"):
        pytest.fail(
            f"O banco de teste precisa terminar em _test (recebi {database!r})."
        )

    try:
        asyncio.run(_create_database(TEST_DATABASE_URL))
    except (OSError, SQLAlchemyError) as error:
        pytest.fail(
            f"Sem Postgres para os testes da presença ({type(error).__name__}). "
            "Suba o banco com `docker compose up -d db` ou defina TEST_DATABASE_URL."
        )

    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # alembic/env.py reads the address from the settings.
    original = settings.database_url
    settings.database_url = TEST_DATABASE_URL
    try:
        command.upgrade(config, "head")
    finally:
        settings.database_url = original


@pytest.fixture
async def banco(postgres_presenca: None) -> AsyncGenerator[AsyncSession]:
    """A session whose work is rolled back at the end of the test.

    The code under test may commit: the commits go to savepoints inside an outer
    transaction that is never committed.
    """
    engine = create_async_engine(
        TEST_DATABASE_URL, poolclass=NullPool, connect_args={"statement_cache_size": 0}
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


@pytest.fixture
def correio() -> CorreioFalso:
    """Records the e-mails the routes would send, without sending anything."""
    return CorreioFalso()


@pytest.fixture
async def api(
    banco: AsyncSession, correio: CorreioFalso
) -> AsyncGenerator[Callable[..., AsyncClient]]:
    """Calls the real app with the test session, signed in as `user`, on `today`."""
    clients: list[AsyncClient] = []

    async def session_override() -> AsyncGenerator[AsyncSession]:
        yield banco

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[email_connection] = lambda: correio.connect

    def make(user: User | None, today: date = EVENT_DAY) -> AsyncClient:
        app.dependency_overrides[current_day] = lambda: today
        cookies = {SESSION_COOKIE: create_access_token(user.id)} if user else {}
        client = AsyncClient(
            transport=ASGITransport(app=app), base_url="http://teste", cookies=cookies
        )
        clients.append(client)
        return client

    try:
        yield make
    finally:
        for client in clients:
            await client.aclose()
        app.dependency_overrides.clear()


# Tables the concurrency tests may write to, children first, for the cleanup.
_TABLES_TO_CLEAN = (
    "attendance_emails",
    "invites",
    "participations",
    "girls",
    "actions",
    "group_coordinators",
    "groups",
    "users",
)


@pytest.fixture
async def banco_concorrente(
    postgres_presenca: None, correio: CorreioFalso
) -> AsyncGenerator[async_sessionmaker[AsyncSession]]:
    """Real, committed sessions on separate connections, for races.

    A race needs two connections that really commit, so these tests cannot run
    inside the rolled-back transaction of `banco`. Every route call gets a
    session of its own, as in production, and at the end the rows created by
    the test are deleted (only rows newer than the ones that existed before).
    """
    engine = create_async_engine(
        TEST_DATABASE_URL, poolclass=NullPool, connect_args={"statement_cache_size": 0}
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.connect() as connection:
        before = {
            table: await connection.scalar(
                text(f"SELECT coalesce(max(id), 0) FROM {table}")
            )
            for table in _TABLES_TO_CLEAN
        }

    async def session_override() -> AsyncGenerator[AsyncSession]:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[email_connection] = lambda: correio.connect
    try:
        yield sessions
    finally:
        app.dependency_overrides.clear()
        async with engine.begin() as connection:
            for table in _TABLES_TO_CLEAN:
                await connection.execute(
                    text(f"DELETE FROM {table} WHERE id > :id"),
                    {"id": before[table]},
                )
        await engine.dispose()


def client_for(user: User, today: date = EVENT_DAY) -> AsyncClient:
    """A client of the real app, signed in as `user` (for `banco_concorrente`)."""
    app.dependency_overrides[current_day] = lambda: today
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://teste",
        cookies={SESSION_COOKIE: create_access_token(user.id)},
    )
