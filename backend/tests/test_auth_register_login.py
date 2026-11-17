import pytest

from app.auth.permissions import SESSION_COOKIE
from app.auth.utils import decode_access_token, hash_password
from app.main import app
from app.users.models import Role, User
from tests.helpers import chamar_rota, sessao_com, sessao_para_busca, token_do_cookie

HASH_DA_ALANA = hash_password("senha-ficticia")

CADASTRO = {
    "name": "Alana Ficticia",
    "email": "Alana@Exemplo.com",
    "password": "senha-ficticia",
}
LOGIN = {"email": "alana@exemplo.com", "password": "senha-ficticia"}


def alana(password_hash: str | None = HASH_DA_ALANA) -> User:
    return User(
        id=1,
        email="alana@exemplo.com",
        name="Alana Ficticia",
        password_hash=password_hash,
        role=Role.GIRL,
    )


async def test_cadastro_cria_a_conta_e_ja_loga() -> None:
    response = await chamar_rota(
        app, "POST", "/api/auth/register", sessao_para_busca(None), corpo=CADASTRO
    )

    assert response.status_code == 201
    assert response.json() == {
        "id": 1,
        "email": "alana@exemplo.com",
        "name": "Alana Ficticia",
        "role": "girl",
    }
    assert "HttpOnly" in response.headers["set-cookie"]
    assert decode_access_token(token_do_cookie(response)) == 1


async def test_cadastro_ignora_o_papel_enviado() -> None:
    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/register",
        sessao_para_busca(None),
        corpo={**CADASTRO, "role": "coordinator"},
    )

    assert response.status_code == 201
    assert response.json()["role"] == "girl"


async def test_cadastro_com_email_existente_responde_409() -> None:
    response = await chamar_rota(
        app, "POST", "/api/auth/register", sessao_para_busca(alana()), corpo=CADASTRO
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "E-mail já cadastrado"}
    assert "set-cookie" not in response.headers


async def test_cadastro_invalido_nem_consulta_o_banco() -> None:
    sessao_falsa = sessao_para_busca(None)

    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/register",
        sessao_falsa,
        corpo={**CADASTRO, "password": "curta"},
    )

    assert response.status_code == 422
    sessao_falsa.scalar.assert_not_awaited()


async def test_login_certo_grava_o_cookie() -> None:
    response = await chamar_rota(
        app, "POST", "/api/auth/login", sessao_para_busca(alana()), corpo=LOGIN
    )

    assert response.status_code == 200
    assert response.json()["email"] == "alana@exemplo.com"
    assert "password_hash" not in response.json()
    assert "HttpOnly" in response.headers["set-cookie"]
    assert decode_access_token(token_do_cookie(response)) == 1


async def test_cookie_do_login_abre_o_me() -> None:
    # A corrente inteira: login -> cookie -> /me reconhece a usuária.
    login = await chamar_rota(
        app, "POST", "/api/auth/login", sessao_para_busca(alana()), corpo=LOGIN
    )

    me = await chamar_rota(
        app, "GET", "/api/auth/me", sessao_com(alana()), token=token_do_cookie(login)
    )

    assert me.status_code == 200
    assert me.json()["id"] == 1


@pytest.mark.parametrize(
    ("usuaria", "senha"),
    [
        (alana(), "senha-errada"),
        (None, "senha-ficticia"),
        (alana(password_hash=None), "senha-ficticia"),
    ],
    ids=["senha-errada", "email-inexistente", "conta-so-do-google"],
)
async def test_login_falho_responde_sempre_igual(
    usuaria: User | None, senha: str
) -> None:
    # A mesma resposta nos três casos: não dá para descobrir quem tem conta.
    response = await chamar_rota(
        app,
        "POST",
        "/api/auth/login",
        sessao_para_busca(usuaria),
        corpo={**LOGIN, "password": senha},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "E-mail ou senha incorretos"}
    assert SESSION_COOKIE not in response.headers.get("set-cookie", "")
