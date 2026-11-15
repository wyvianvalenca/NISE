"""Cadastro pelo Google depois do callback (#52, #100): A02b e A02c.

O cadastro pendente vive no cookie httpOnly que o callback grava. Aqui ele é
montado com create_pending_signup_token. Dados fictícios.
"""

from httpx2 import ASGITransport, AsyncClient, Response

from app.auth.google import GoogleProfile
from app.auth.permissions import PENDING_SIGNUP_COOKIE
from app.auth.utils import (
    PendingSignup,
    create_access_token,
    create_pending_signup_token,
)
from app.main import app

PERFIL = GoogleProfile(
    subject="google-123", email="alana@exemplo.com", name="Alana Ficticia"
)
PENDENTE = create_pending_signup_token(
    PendingSignup(profile=PERFIL, invite="convite-ficticio")
)


async def chamar(metodo: str, url: str, pendente: str | None = PENDENTE) -> Response:
    cookies = {PENDING_SIGNUP_COOKIE: pendente} if pendente else {}
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://teste", cookies=cookies
    ) as client:
        return await client.request(metodo, url)


# GET /api/auth/signup/pending


async def test_pendente_devolve_nome_e_email_do_google() -> None:
    response = await chamar("GET", "/api/auth/signup/pending")

    assert response.status_code == 200
    # Só o que ela já viu no Google: o convite não sai do cookie.
    assert response.json() == {"name": "Alana Ficticia", "email": "alana@exemplo.com"}


async def test_sem_cookie_nao_ha_cadastro_pendente() -> None:
    response = await chamar("GET", "/api/auth/signup/pending", pendente=None)

    assert response.status_code == 404


async def test_cookie_adulterado_nao_vale() -> None:
    response = await chamar("GET", "/api/auth/signup/pending", PENDENTE + "x")

    assert response.status_code == 404


async def test_token_de_sessao_nao_vale_como_cadastro_pendente() -> None:
    response = await chamar("GET", "/api/auth/signup/pending", create_access_token(1))

    assert response.status_code == 404


# POST /api/auth/signup/discard


async def test_descartar_apaga_o_cookie_pendente() -> None:
    response = await chamar("POST", "/api/auth/signup/discard")

    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f'{PENDING_SIGNUP_COOKIE}="";')
    assert "Max-Age=0" in cookie
    # No mesmo Path em que o callback gravou, senão o navegador não apaga.
    assert "Path=/;" in cookie


async def test_descartar_sem_cadastro_pendente_tambem_responde_204() -> None:
    response = await chamar("POST", "/api/auth/signup/discard", pendente=None)

    assert response.status_code == 204
