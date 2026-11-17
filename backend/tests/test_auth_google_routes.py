import urllib.parse
from collections.abc import AsyncGenerator, Iterator
from unittest.mock import AsyncMock

import httpx2
import pytest
from httpx2 import ASGITransport, AsyncClient, Response

from app.auth import routes
from app.auth.google import (
    GOOGLE_AUTHORIZATION_URL,
    GoogleProfile,
    make_code_challenge,
)
from app.auth.permissions import (
    GOOGLE_STATE_COOKIE,
    GOOGLE_VERIFIER_COOKIE,
    PENDING_SIGNUP_COOKIE,
    SESSION_COOKIE,
)
from app.auth.utils import decode_access_token, decode_pending_signup_token
from app.config import AppSettings, settings
from app.db.engine import get_session
from app.main import app
from app.users.models import Role, User
from tests.helpers import sessao_para_busca

CALLBACK = "/api/auth/google/callback"
PERFIL = GoogleProfile(
    subject="google-123", email="alana@exemplo.com", name="Alana Ficticia"
)
# Os cookies que o login teria gravado neste navegador.
COOKIES_DO_LOGIN = {GOOGLE_STATE_COOKIE: "state-ficticio", GOOGLE_VERIFIER_COOKIE: "v"}
VOLTA_DO_GOOGLE = "?code=code-ficticio&state=state-ficticio"


class GoogleFalso:
    # Faz o papel do Google: as rotas nunca saem para a rede nos testes.
    def __init__(self) -> None:
        self.id_token: str | None = "id-token-ficticio"
        self.perfil: GoogleProfile | None = PERFIL
        self.trocas: list[tuple[str, str]] = []

    async def exchange_code(
        self, http: httpx2.AsyncClient, code: str, code_verifier: str
    ) -> str | None:
        self.trocas.append((code, code_verifier))
        return self.id_token

    async def validate_id_token(self, id_token: str) -> GoogleProfile | None:
        return self.perfil if id_token == "id-token-ficticio" else None


@pytest.fixture(autouse=True)
def google(monkeypatch: pytest.MonkeyPatch) -> GoogleFalso:
    falso = GoogleFalso()
    # Troca no módulo das rotas, que é onde os nomes foram importados.
    monkeypatch.setattr(routes, "exchange_code", falso.exchange_code)
    monkeypatch.setattr(routes, "validate_id_token", falso.validate_id_token)
    monkeypatch.setattr(settings, "google_client_id", "cliente-ficticio")
    return falso


@pytest.fixture
def sessao_falsa() -> Iterator[AsyncMock]:
    # Por padrão, ninguém tem conta; cada teste troca o que o banco devolve.
    sessao = sessao_para_busca(None)

    async def trocar_sessao() -> AsyncGenerator[AsyncMock, None]:
        yield sessao

    app.dependency_overrides[get_session] = trocar_sessao
    yield sessao
    app.dependency_overrides.clear()


async def chamar(url: str, cookies: dict[str, str] | None = None) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://teste", cookies=cookies
    ) as client:
        return await client.get(url)


def cookies_gravados(response: Response) -> dict[str, str]:
    # Nome do cookie -> o cabeçalho Set-Cookie inteiro dele.
    return {
        cabecalho.split("=", 1)[0]: cabecalho
        for cabecalho in response.headers.get_list("set-cookie")
    }


def valor(cabecalho: str) -> str:
    return cabecalho.split(";", 1)[0].split("=", 1)[1]


def apagado(cabecalho: str) -> bool:
    return "Max-Age=0" in cabecalho


# Login


async def test_login_redireciona_para_o_google_com_o_state_do_cookie() -> None:
    response = await chamar("/api/auth/google/login")

    assert response.status_code == 302
    assert response.headers["location"].startswith(GOOGLE_AUTHORIZATION_URL)

    consulta = urllib.parse.urlsplit(response.headers["location"]).query
    parametros = urllib.parse.parse_qs(consulta)
    cookies = cookies_gravados(response)
    assert parametros["state"] == [valor(cookies[GOOGLE_STATE_COOKIE])]
    # O Google recebe o hash; o verificador fica no cookie para a troca do code.
    verifier = valor(cookies[GOOGLE_VERIFIER_COOKIE])
    assert parametros["code_challenge"] == [make_code_challenge(verifier)]


@pytest.mark.parametrize("nome", [GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE])
async def test_login_grava_os_cookies_do_google(nome: str) -> None:
    cookie = cookies_gravados(await chamar("/api/auth/google/login"))[nome]

    assert "HttpOnly" in cookie
    # Com strict, o navegador não mandaria o cookie na volta do Google.
    assert "SameSite=lax" in cookie
    assert "Path=/api/auth/google;" in cookie
    assert "Max-Age=600" in cookie


async def test_cada_login_gera_um_state_novo() -> None:
    primeiro = cookies_gravados(await chamar("/api/auth/google/login"))
    segundo = cookies_gravados(await chamar("/api/auth/google/login"))

    assert valor(primeiro[GOOGLE_STATE_COOKIE]) != valor(segundo[GOOGLE_STATE_COOKIE])


async def test_login_aceita_os_parametros_do_front() -> None:
    response = await chamar("/api/auth/google/login?convite=abc&trocar_conta=1")

    assert response.status_code == 302


# Callback: endereço


def test_callback_esta_no_endereco_cadastrado_no_google() -> None:
    # O Google só volta para o redirect_uri exato; uma barra a mais ou a menos
    # deixa a rota fora do caminho.
    padrao = AppSettings.model_fields["google_redirect_uri"].default

    assert app.url_path_for("google_callback") == urllib.parse.urlsplit(padrao).path


# Callback: conta existente


async def test_conta_existente_entra(
    google: GoogleFalso, sessao_falsa: AsyncMock
) -> None:
    sessao_falsa.scalar.return_value = User(
        id=7, email="alana@exemplo.com", name="Alana Ficticia", role=Role.GIRL
    )

    response = await chamar(CALLBACK + VOLTA_DO_GOOGLE, COOKIES_DO_LOGIN)

    assert response.status_code == 302
    assert response.headers["location"] == "/"
    cookies = cookies_gravados(response)
    assert "HttpOnly" in cookies[SESSION_COOKIE]
    assert decode_access_token(valor(cookies[SESSION_COOKIE])) == 7
    assert apagado(cookies[PENDING_SIGNUP_COOKIE])
    # A troca usou o code da URL e o verificador do cookie.
    assert google.trocas == [("code-ficticio", "v")]


# Callback: pessoa nova


async def test_pessoa_nova_vai_completar_o_cadastro(sessao_falsa: AsyncMock) -> None:
    response = await chamar(CALLBACK + VOLTA_DO_GOOGLE, COOKIES_DO_LOGIN)

    assert response.status_code == 302
    assert response.headers["location"] == "/cadastro/google"
    cookies = cookies_gravados(response)
    assert "HttpOnly" in cookies[PENDING_SIGNUP_COOKIE]
    pendente = decode_pending_signup_token(valor(cookies[PENDING_SIGNUP_COOKIE]))
    assert pendente == PERFIL
    # Se havia outra conta logada neste navegador, ela sai.
    assert apagado(cookies[SESSION_COOKIE])


async def test_pessoa_nova_nao_vai_para_o_banco(sessao_falsa: AsyncMock) -> None:
    # Ainda não se sabe a idade dela (RN-03).
    await chamar(CALLBACK + VOLTA_DO_GOOGLE, COOKIES_DO_LOGIN)

    sessao_falsa.add.assert_not_called()
    sessao_falsa.commit.assert_not_awaited()


# Callback: falhas


@pytest.mark.parametrize(
    ("consulta", "cookies", "id_token", "perfil"),
    [
        ("?error=access_denied&state=state-ficticio", COOKIES_DO_LOGIN, "", PERFIL),
        ("?code=code-ficticio&state=outro", COOKIES_DO_LOGIN, "", PERFIL),
        ("?code=code-ficticio&state=%C3%A3", COOKIES_DO_LOGIN, "", PERFIL),
        ("?code=code-ficticio", COOKIES_DO_LOGIN, "", PERFIL),
        (VOLTA_DO_GOOGLE, {GOOGLE_VERIFIER_COOKIE: "v"}, "", PERFIL),
        (VOLTA_DO_GOOGLE, {GOOGLE_STATE_COOKIE: "state-ficticio"}, "", PERFIL),
        (VOLTA_DO_GOOGLE, COOKIES_DO_LOGIN, None, PERFIL),
        (VOLTA_DO_GOOGLE, COOKIES_DO_LOGIN, "", None),
    ],
    ids=[
        "cancelou-no-google",
        "state-diferente",
        "state-com-acento",
        "sem-state-na-url",
        "sem-cookie-do-state",
        "sem-cookie-do-verificador",
        "troca-do-code-falhou",
        "id-token-invalido",
    ],
)
async def test_falha_volta_para_o_inicio_sem_sessao(
    consulta: str,
    cookies: dict[str, str],
    id_token: str | None,
    perfil: GoogleProfile | None,
    google: GoogleFalso,
    sessao_falsa: AsyncMock,
) -> None:
    # "" mantém o id_token que o GoogleFalso aceita.
    if id_token is None:
        google.id_token = None
    google.perfil = perfil

    response = await chamar(CALLBACK + consulta, cookies)

    # Um redirect, nunca um erro 500 ou um JSON de 422 na tela dela.
    assert response.status_code == 302
    assert response.headers["location"] == "/?erro=google"
    gravados = cookies_gravados(response)
    assert SESSION_COOKIE not in gravados
    assert PENDING_SIGNUP_COOKIE not in gravados
    sessao_falsa.add.assert_not_called()


async def test_state_errado_nem_chama_o_google(
    google: GoogleFalso, sessao_falsa: AsyncMock
) -> None:
    await chamar(CALLBACK + "?code=code-ficticio&state=outro", COOKIES_DO_LOGIN)

    assert google.trocas == []


@pytest.mark.parametrize(
    ("consulta", "conta"),
    [
        (VOLTA_DO_GOOGLE, True),
        (VOLTA_DO_GOOGLE, False),
        ("?code=code-ficticio&state=outro", False),
    ],
    ids=["conta-existente", "pessoa-nova", "falha"],
)
async def test_callback_sempre_apaga_os_cookies_do_google(
    consulta: str, conta: bool, sessao_falsa: AsyncMock
) -> None:
    # O state e o verificador servem para uma única volta.
    if conta:
        sessao_falsa.scalar.return_value = User(
            id=7, email="alana@exemplo.com", name="Alana Ficticia", role=Role.GIRL
        )

    cookies = cookies_gravados(await chamar(CALLBACK + consulta, COOKIES_DO_LOGIN))

    for nome in (GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE):
        assert apagado(cookies[nome])
        # No mesmo Path em que foram gravados, senão o navegador não apaga.
        assert "Path=/api/auth/google;" in cookies[nome]
