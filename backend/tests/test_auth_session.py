from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.auth.permissions import SESSION_COOKIE
from app.auth.utils import JWT_ALGORITHM, create_access_token
from app.config import settings
from app.main import app
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com


def alana() -> User:
    return User(
        id=1,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        password_hash="hash-ficticio",
        role=Role.GIRL,
    )


async def test_me_sem_cookie_responde_401() -> None:
    sessao_falsa = sessao_com(alana())

    response = await chamar_rota(app, "GET", "/api/auth/me", sessao_falsa)

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}
    sessao_falsa.get.assert_not_awaited()


async def test_me_com_token_valido_devolve_a_usuaria() -> None:
    sessao_falsa = sessao_com(alana())

    response = await chamar_rota(
        app, "GET", "/api/auth/me", sessao_falsa, token=create_access_token(1)
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
        app, "GET", "/api/auth/me", sessao_com(alana()), token=create_access_token(1)
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

    response = await chamar_rota(app, "GET", "/api/auth/me", sessao_falsa, token=token)

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}
    sessao_falsa.get.assert_not_awaited()


async def test_me_de_usuaria_apagada_responde_401() -> None:
    response = await chamar_rota(
        app, "GET", "/api/auth/me", sessao_com(None), token=create_access_token(1)
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticada"}


async def test_logout_apaga_o_cookie() -> None:
    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/logout",
        sessao_com(alana()),
        token=create_access_token(1),
    )

    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    assert f'{SESSION_COOKIE}=""' in cookie
    assert "Max-Age=0" in cookie
    # O navegador só apaga o cookie se path e httponly baterem com os da criação.
    assert "Path=/" in cookie
    assert "HttpOnly" in cookie


async def test_logout_sem_estar_logada_responde_204() -> None:
    response = await chamar_rota(app, "POST", "/api/auth/logout", sessao_com(None))

    assert response.status_code == 204
