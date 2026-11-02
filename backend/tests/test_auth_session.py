from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import jwt
import pytest
from httpx import ASGITransport, AsyncClient, Response

from app.auth.permissions import SESSION_COOKIE
from app.auth.utils import JWT_ALGORITHM, create_access_token
from app.config import settings
from app.db.engine import get_session
from app.main import app
from app.users.models import Role, User


def sessao_com(usuaria: User | None) -> AsyncMock:
    # session.get(User, id) devolve a usuária, ou None se ela não existe mais.
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = usuaria
    return sessao_falsa


def alana() -> User:
    return User(
        id=1,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        password_hash="hash-ficticio",
        role=Role.GIRL,
    )


async def chamar_rota(
    metodo: str, url: str, sessao_falsa: AsyncMock, token: str | None = None
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


async def test_me_sem_cookie_responde_401() -> None:
    sessao_falsa = sessao_com(alana())

    response = await chamar_rota("GET", "/api/auth/me", sessao_falsa)

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}
    sessao_falsa.get.assert_not_awaited()


async def test_me_com_token_valido_devolve_a_usuaria() -> None:
    sessao_falsa = sessao_com(alana())

    response = await chamar_rota(
        "GET", "/api/auth/me", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "email": "alana@exemplo.com",
        "name": "Alana Ficticia",
        "role": "girl",
    }
    sessao_falsa.get.assert_awaited_once_with(User, 1)


async def test_me_nao_devolve_o_hash_da_senha() -> None:
    response = await chamar_rota(
        "GET", "/api/auth/me", sessao_com(alana()), token=create_access_token(1)
    )

    assert "password_hash" not in response.json()


@pytest.mark.parametrize(
    "token",
    [
        jwt.encode(
            {"sub": "1", "exp": datetime.now(UTC) - timedelta(minutes=1)},
            settings.jwt_secret,
            algorithm=JWT_ALGORITHM,
        ),
        jwt.encode(
            {"sub": "1", "exp": datetime.now(UTC) + timedelta(minutes=10)},
            "outro-segredo-grande-o-suficiente-32b",
            algorithm=JWT_ALGORITHM,
        ),
        "texto-qualquer",
    ],
    ids=["expirado", "outro-segredo", "texto-qualquer"],
)
async def test_me_com_token_invalido_responde_401(token: str) -> None:
    sessao_falsa = sessao_com(alana())

    response = await chamar_rota("GET", "/api/auth/me", sessao_falsa, token=token)

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}
    sessao_falsa.get.assert_not_awaited()


async def test_me_de_usuaria_apagada_responde_401() -> None:
    response = await chamar_rota(
        "GET", "/api/auth/me", sessao_com(None), token=create_access_token(1)
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}


async def test_logout_apaga_o_cookie() -> None:
    response = await chamar_rota(
        "POST", "/api/auth/logout", sessao_com(alana()), token=create_access_token(1)
    )

    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    assert f'{SESSION_COOKIE}=""' in cookie
    assert "Max-Age=0" in cookie
    # O navegador só apaga o cookie se path e httponly baterem com os da criação.
    assert "Path=/" in cookie
    assert "HttpOnly" in cookie


async def test_logout_sem_estar_logada_responde_204() -> None:
    response = await chamar_rota("POST", "/api/auth/logout", sessao_com(None))

    assert response.status_code == 204
