from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.db.engine import get_session
from app.main import app


async def chamar_health(sessao_falsa: AsyncMock) -> tuple[int, dict[str, str]]:
    # Troca a sessão real por uma falsa, para o teste não depender do Postgres.
    async def sessao() -> AsyncGenerator[AsyncMock, None]:
        yield sessao_falsa

    app.dependency_overrides[get_session] = sessao
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://teste") as client:
            response = await client.get("/api/health")
    finally:
        app.dependency_overrides.clear()
    return response.status_code, response.json()


async def test_health_responde_ok_quando_o_banco_responde() -> None:
    sessao_falsa = AsyncMock()

    status_code, corpo = await chamar_health(sessao_falsa)

    assert status_code == 200
    assert corpo == {"status": "ok"}
    sessao_falsa.execute.assert_awaited_once()


@pytest.mark.parametrize(
    "erro",
    [
        OperationalError("select 1", {}, Exception("banco caiu")),
        ConnectionRefusedError("conexão recusada"),
    ],
)
async def test_health_responde_503_quando_o_banco_falha(erro: Exception) -> None:
    sessao_falsa = AsyncMock()
    sessao_falsa.execute.side_effect = erro

    status_code, corpo = await chamar_health(sessao_falsa)

    assert status_code == 503
    assert corpo == {"detail": "Banco de dados indisponível"}
