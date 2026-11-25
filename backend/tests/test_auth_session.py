from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx2 import Response

from app.auth.permissions import SESSION_COOKIE, SIGNED_IN_HINT_COOKIE
from app.auth.utils import JWT_ALGORITHM, create_access_token, hash_password
from app.config import settings
from app.main import app
from app.modules.groups.models import Group
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com, sessao_para_busca, sql_do_postgres


def alana() -> User:
    return User(
        id=1,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        password_hash="hash-ficticio",
        role=Role.GIRL,
    )


def conta_com_senha() -> User:
    conta = alana()
    conta.password_hash = hash_password("senha-ficticia")
    return conta


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
        "group": None,
    }
    sessao_falsa.get.assert_awaited_once_with(User, 1)
    sessao_falsa.scalar.assert_not_awaited()


def coordenadora() -> User:
    conta = alana()
    conta.role = Role.COORDINATOR
    return conta


async def test_me_da_coordenadora_devolve_o_grupo_dela() -> None:
    sessao_falsa = sessao_com(coordenadora())
    sessao_falsa.scalar.return_value = Group(id=7, name="Grupo Ficticio Sete")

    response = await chamar_rota(
        app, "GET", "/api/auth/me", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 200
    assert response.json()["group"] == {"id": 7, "name": "Grupo Ficticio Sete"}
    consulta = sessao_falsa.scalar.await_args.args[0]
    assert "group_coordinators.user_id" in sql_do_postgres(consulta)
    assert 1 in consulta.compile().params.values()


async def test_me_de_coordenadora_sem_grupo_devolve_group_nulo() -> None:
    sessao_falsa = sessao_com(coordenadora())
    sessao_falsa.scalar.return_value = None

    response = await chamar_rota(
        app, "GET", "/api/auth/me", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 200
    assert response.json()["group"] is None


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


def cookies_gravados(response: Response) -> dict[str, str]:
    # Cada Set-Cookie separado, pelo nome do cookie.
    return {
        linha.split("=", 1)[0]: linha
        for linha in response.headers.get_list("set-cookie")
    }


async def test_logout_apaga_tambem_o_aviso_de_sessao() -> None:
    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/logout",
        sessao_com(alana()),
        token=create_access_token(1),
    )

    aviso = cookies_gravados(response)[SIGNED_IN_HINT_COOKIE]
    assert "Max-Age=0" in aviso
    assert "Path=/" in aviso


async def test_login_grava_o_aviso_de_sessao_legivel_pelo_front() -> None:
    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/login",
        sessao_para_busca(conta_com_senha()),
        corpo={"email": "alana@exemplo.com", "password": "senha-ficticia"},
    )

    cookies = cookies_gravados(response)
    assert "HttpOnly" in cookies[SESSION_COOKIE]
    # O aviso não tem segredo: só diz que há sessão, e o front precisa lê-lo.
    assert cookies[SIGNED_IN_HINT_COOKIE].startswith(f"{SIGNED_IN_HINT_COOKIE}=1;")
    assert "HttpOnly" not in cookies[SIGNED_IN_HINT_COOKIE]
    assert "Path=/" in cookies[SIGNED_IN_HINT_COOKIE]


async def test_logout_sem_estar_logada_responde_204() -> None:
    response = await chamar_rota(app, "POST", "/api/auth/logout", sessao_com(None))

    assert response.status_code == 204


# A próxima tela de quem já entrou (A01 manda adiante)


async def test_home_sem_sessao_responde_401() -> None:
    response = await chamar_rota(app, "GET", "/api/auth/home", sessao_com(alana()))

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("papel", "aceite", "destino"),
    [
        (Role.GIRL, 1, "/por-que-file"),
        (Role.GIRL, None, "/cadastro/termos"),
        (Role.COORDINATOR, None, "/coordenacao/acoes"),
    ],
    ids=["menina", "menina-sem-os-termos", "coordenadora"],
)
async def test_home_devolve_a_tela_de_cada_perfil(
    papel: Role, aceite: int | None, destino: str
) -> None:
    conta = alana()
    conta.role = papel
    sessao_falsa = sessao_com(conta)
    # session.scalar é a busca do aceite dos termos (o id dele, ou None).
    sessao_falsa.scalar.return_value = aceite

    response = await chamar_rota(
        app, "GET", "/api/auth/home", sessao_falsa, token=create_access_token(1)
    )

    assert response.status_code == 200
    assert response.json() == {"nextPath": destino}
