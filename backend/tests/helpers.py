from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response

from app.auth.permissions import SESSION_COOKIE
from app.db.engine import get_session
from app.users.models import User


def sessao_com(usuaria: User | None) -> AsyncMock:
    # session.get(User, id) devolve a usuária, ou None se ela não existe mais.
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = usuaria
    return sessao_falsa


async def chamar_rota(
    app: FastAPI,
    metodo: str,
    url: str,
    sessao_falsa: AsyncMock,
    token: str | None = None,
) -> Response:
    # Troca a sessão real por uma falsa, para o teste não depender do Postgres.
    async def sessao() -> AsyncGenerator[AsyncMock, None]:
        yield sessao_falsa

    app.dependency_overrides[get_session] = sessao
    cookies = {SESSION_COOKIE: token} if token else {}
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://teste", cookies=cookies
        ) as client:
            return await client.request(metodo, url)
    finally:
        app.dependency_overrides.clear()
