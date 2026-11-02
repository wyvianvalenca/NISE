import re
from collections.abc import AsyncGenerator, Mapping
from unittest.mock import AsyncMock, MagicMock

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


def _dar_id(usuaria: User) -> None:
    # O banco daria o id no commit; aqui damos no add, para o token e o UserOut.
    usuaria.id = 1


def sessao_para_busca(usuaria: User | None) -> AsyncMock:
    # session.scalar(select(...)) devolve a usuária achada pelo e-mail, ou None.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalar.return_value = usuaria
    # session.add é síncrono: com AsyncMock, viraria uma corrotina nunca aguardada.
    sessao_falsa.add = MagicMock(side_effect=_dar_id)
    return sessao_falsa


def token_do_cookie(response: Response) -> str:
    # Lê o token direto do Set-Cookie: o httpx pode recusar guardar um cookie
    # Secure vindo de http://, e isso depende do COOKIE_SECURE do ambiente.
    achado = re.search(rf"{SESSION_COOKIE}=([^;]+)", response.headers["set-cookie"])
    assert achado is not None
    return achado.group(1)


async def chamar_rota(
    app: FastAPI,
    metodo: str,
    url: str,
    sessao_falsa: AsyncMock,
    token: str | None = None,
    corpo: Mapping[str, object] | None = None,
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
            return await client.request(metodo, url, json=corpo)
    finally:
        app.dependency_overrides.clear()
